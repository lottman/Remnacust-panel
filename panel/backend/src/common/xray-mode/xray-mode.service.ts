import type { Prisma } from '@prisma/client';

import { AsyncLocalStorage } from 'node:async_hooks';
import { setTimeout as delay } from 'node:timers/promises';

import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '@common/database/prisma.service';

import { hasXrayDatabaseCode } from './xray-mode-conflict';
import { CUSTOM_CORE_FEATURES, customCoreConfigPaths, type XrayMode } from './xray-mode-policy';

export interface XrayModeState {
    mode: XrayMode;
    revision: number;
}

@Injectable()
export class XrayModeService {
    private pending?: Promise<XrayModeState>;
    private readonly snapshot = new AsyncLocalStorage<XrayModeState>();

    constructor(private readonly prisma: PrismaService) {}

    async get(fresh = false): Promise<XrayModeState> {
        if (!fresh && this.snapshot.getStore()) return this.snapshot.getStore()!;
        if (!fresh && this.pending) return this.pending;
        const operation = (async () => {
            const rows = await this.prisma.$queryRaw<
                XrayModeState[]
            >`SELECT mode, revision FROM xera_xray_settings WHERE id=1`;
            const state = rows[0];
            if (
                !state ||
                !['custom', 'default'].includes(state.mode) ||
                !Number.isSafeInteger(state.revision)
            ) {
                throw new ServiceUnavailableException('Xray settings are unavailable');
            }
            return state;
        })();
        if (!fresh) this.pending = operation;
        try {
            return await operation;
        } finally {
            if (this.pending === operation) this.pending = undefined;
        }
    }

    async isCustom(): Promise<boolean> {
        return (await this.get()).mode === 'custom';
    }

    async withSnapshot<T>(work: () => Promise<T>): Promise<T> {
        if (this.snapshot.getStore()) return work();
        return this.snapshot.run(await this.get(true), work);
    }

    hasSnapshot(): boolean {
        return this.snapshot.getStore() !== undefined;
    }

    async pendingApply(): Promise<number | undefined> {
        const rows = await this.prisma.$queryRaw<
            { revision: number }[]
        >`SELECT revision FROM xera_xray_settings WHERE id=1 AND apply_pending`;
        return rows[0]?.revision;
    }

    async markQueued(revision: number): Promise<void> {
        await this.prisma.$executeRaw`WITH selected AS (
            SELECT id FROM xera_xray_settings WHERE id=1 AND revision=${revision} FOR UPDATE SKIP LOCKED
        ) UPDATE xera_xray_settings s SET apply_pending=false FROM selected WHERE s.id=selected.id AND s.revision=${revision}`;
    }

    async assertCurrent(): Promise<XrayModeState> {
        const current = await this.get(true);
        const snapshot = this.snapshot.getStore();
        if (
            snapshot &&
            (current.mode !== snapshot.mode || current.revision !== snapshot.revision)
        ) {
            throw new ConflictException({ code: 'XRAY_SETTINGS_CHANGED' });
        }
        return current;
    }

    async assertCustom(feature: string): Promise<void> {
        if ((await this.get(true)).mode !== 'custom') {
            throw new ConflictException({ code: 'CUSTOM_XRAY_REQUIRED', feature });
        }
    }

    async change(mode: XrayMode, expectedRevision: number): Promise<XrayModeState> {
        const deadline = performance.now() + 5000;
        for (;;) {
            try {
                return await this.prisma.$transaction(
                    async (tx) => {
                        const current = await tx.$queryRaw<
                            XrayModeState[]
                        >`SELECT mode,revision FROM xera_xray_settings WHERE id=1 FOR UPDATE NOWAIT`;
                        if (current[0]?.revision !== expectedRevision)
                            throw new ConflictException({ code: 'XRAY_SETTINGS_CHANGED' });
                        const blockers = mode === 'default' ? await this.defaultBlockers(tx) : [];
                        if (blockers.length)
                            throw new ConflictException({ code: 'DEFAULT_XRAY_BLOCKED', blockers });
                        const result = await tx.$queryRaw<XrayModeState[]>`UPDATE xera_xray_settings
                SET mode=${mode},revision=revision+1,apply_pending=true WHERE id=1 AND revision=${expectedRevision}
                RETURNING mode,revision`;
                        if (!result.length)
                            throw new ConflictException({ code: 'XRAY_SETTINGS_CHANGED' });
                        return result[0];
                    },
                    { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 30000 },
                );
            } catch (error) {
                if (!hasXrayDatabaseCode(error, '55P03')) throw error;
                if (performance.now() >= deadline)
                    throw new ConflictException({ code: 'XRAY_SETTINGS_CHANGED', retryable: true });
                await delay(25);
            }
        }
    }

    async defaultBlockers(
        client: Pick<Prisma.TransactionClient, '$queryRaw'> = this.prisma,
    ): Promise<{ code: string; id?: string; name?: string; paths?: string[] }[]> {
        const [profiles, templates, ports, quota] = await Promise.all([
            client.$queryRaw<
                { uuid: string; name: string; config: unknown; snippetRequiresCustom: boolean }[]
            >`SELECT DISTINCT p.uuid,p.name,p.config,xera_xray_config_uses_custom_snippets(p.config) AS "snippetRequiresCustom"
                FROM config_profiles p JOIN nodes n ON n.active_config_profile_uuid=p.uuid WHERE NOT n.is_disabled`,
            client.$queryRaw<
                { uuid: string; name: string; config: unknown }[]
            >`SELECT uuid,name,template_json AS config
                FROM subscription_templates WHERE template_type='XRAY_JSON'`,
            client.$queryRaw<
                { uuid: string; name: string }[]
            >`SELECT n.uuid,n.name FROM xera_node_port_plans p
                JOIN nodes n ON n.uuid=p.node_uuid WHERE p.enabled AND NOT n.is_disabled LIMIT 1000`,
            client.$queryRaw<
                { uuid: string; name: string }[]
            >`SELECT n.uuid,n.name FROM xera_quota_node_modes q
                JOIN nodes n ON n.uuid=q.node_uuid LIMIT 1000`,
        ]);
        return [
            ...profiles.flatMap((profile) => {
                const paths = customCoreConfigPaths(profile.config);
                if (!paths.length && profile.snippetRequiresCustom)
                    paths.push('referenced-snippet');
                return paths.length
                    ? [{ code: 'custom-profile', id: profile.uuid, name: profile.name, paths }]
                    : [];
            }),
            ...templates.flatMap((template) => {
                const paths = customCoreConfigPaths(template.config);
                return paths.length
                    ? [{ code: 'custom-template', id: template.uuid, name: template.name, paths }]
                    : [];
            }),
            ...ports.map((node) => ({ code: 'port-plan', id: node.uuid, name: node.name })),
            ...quota.map((node) => ({ code: 'quota-journal', id: node.uuid, name: node.name })),
        ];
    }

    async describe() {
        const state = await this.get();
        return { ...state, customFeatures: state.mode === 'custom' ? CUSTOM_CORE_FEATURES : [] };
    }
}

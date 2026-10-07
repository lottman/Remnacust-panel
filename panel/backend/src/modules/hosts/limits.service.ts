import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';

import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { TxKyselyService } from '@common/database';
import { HostPolicyService } from '@common/host-policy/host-policy.service';

import { HostsService } from './hosts.service';
import { limitScopesQuery, LimitScope } from './limit-scopes.query';
import { LimitSelection, limitSelectionPredicate } from './limit-selection';
import { HostsRepository } from './repositories/hosts.repository';

export type LimitKind = 'HOST' | 'TAG';
export type LimitUsersOptions = {
    pageSize?: number;
    status?: 'ALL' | 'ACTIVE' | 'DISABLED' | 'LIMITED' | 'EXPIRED';
    state?: 'ALL' | 'PAUSED' | 'EXHAUSTED' | 'AVAILABLE' | 'UNAVAILABLE';
    sort?:
        | 'username'
        | 'id'
        | 'expireAt'
        | 'usedBytes'
        | 'limitBytes'
        | 'remainingBytes'
        | 'bonusBytes';
    direction?: 'asc' | 'desc';
};
export type LimitAction = {
    kind: LimitKind;
    key: string;
    action: 'ADD' | 'RESET' | 'PAUSE' | 'RESUME' | 'UNLIMITED' | 'LIMITED';
    amountBytes: number;
    requestId: string;
    selection: LimitSelection;
};

@Injectable()
export class LimitsService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly hosts: HostsRepository,
        private readonly hostsService: HostsService,
        private readonly policy: HostPolicyService,
    ) {}

    async list(withUsage = true): Promise<LimitScope[]> {
        return (await limitScopesQuery(withUsage).execute(this.db.kysely)).rows;
    }
    private async scope(kind: LimitKind, key: string) {
        const scope = (await this.list(false)).find(
            (item) => item.kind === kind && item.key === key,
        );
        if (!scope) throw new NotFoundException('Хост или тег не найден');
        return scope;
    }
    async targets() {
        return (
            await sql<{
                type: 'INTERNAL' | 'EXTERNAL';
                uuid: string;
                name: string;
            }>`SELECT 'INTERNAL'::text AS type,uuid,name FROM internal_squads UNION ALL SELECT 'EXTERNAL',uuid,name FROM external_squads ORDER BY type,name`.execute(
                this.db.kysely,
            )
        ).rows;
    }
    private async validateSelection(selection: LimitSelection) {
        if (
            selection.type === 'SQUAD' &&
            !(await this.targets()).some(
                (s) => s.type === selection.squadType && s.uuid === selection.squadUuid,
            )
        )
            throw new NotFoundException('Сквад не найден');
    }
    async selectionState(kind: LimitKind, key: string, selection: LimitSelection) {
        await this.scope(kind, key);
        await this.validateSelection(selection);
        // Only block flags are needed: do not calculate traffic history for every recipient.
        // Read scope and personal flags in one statement, without table search/pagination.
        const result = await sql<{
            total: number;
            pausedUsers: number;
            unlimitedUsers: number;
            scopePaused: boolean;
        }>`
            WITH state AS (SELECT COALESCE((SELECT paused FROM xera_limit_scopes
                WHERE kind=${kind} AND key=${key}),false) AS paused), recipients AS (
                SELECT COALESCE(a.paused,false) OR s.paused AS paused, COALESCE(a.unlimited,false) AS unlimited
                FROM users u CROSS JOIN state s
                LEFT JOIN xera_limit_user_adjustments a ON a.kind=${kind} AND a.key=${key} AND a.user_id=u.id
                WHERE xera_limit_entitled(${kind},${key},u.id) AND ${limitSelectionPredicate(selection)}
            ) SELECT count(*)::integer AS total,
                count(*) FILTER (WHERE paused)::integer AS "pausedUsers",
                count(*) FILTER (WHERE unlimited)::integer AS "unlimitedUsers",
                (SELECT paused FROM state) AS "scopePaused" FROM recipients
        `.execute(this.db.kysely);
        return result.rows[0];
    }
    async users(
        kind: LimitKind,
        key: string,
        page: number,
        search: string,
        selection: LimitSelection = { type: 'ALL' },
        options: LimitUsersOptions = {},
    ) {
        const scope = await this.scope(kind, key);
        await this.validateSelection(selection);
        const {
            pageSize = 50,
            status = 'ALL',
            state = 'ALL',
            sort = 'username',
            direction = 'asc',
        } = options;
        const recipients = sql`xera_limit_entitled(${kind},${key},u.id) AND ${limitSelectionPredicate(selection)}`;
        const where = sql`${recipients} AND (${status}='ALL' OR u.status::text=${status}) AND (
            position(lower(${search}) in lower(u.username))>0 OR position(${search} in u.id::text)>0
            OR position(lower(${search}) in lower(u.short_uuid))>0
            OR position(lower(${search}) in lower(COALESCE(u.email,'')))>0
            OR position(${search} in COALESCE(u.telegram_id::text,''))>0)`;
        const ordering = {
            username: sql`lower(username)`,
            id: sql`id::bigint`,
            expireAt: sql`"expireAt"`,
            usedBytes: sql`"usedBytes"::numeric`,
            limitBytes: sql`NULLIF("limitBytes"::numeric,0)`,
            remainingBytes: sql`CASE WHEN "limitBytes"::numeric>0 THEN greatest(0,"limitBytes"::numeric-"usedBytes"::numeric) END`,
            bonusBytes: sql`"bonusBytes"::numeric`,
        }[sort];
        const order = sql`${ordering} ${direction === 'desc' ? sql`DESC` : sql`ASC`} NULLS LAST, id::bigint`;
        type Row = {
            id: string;
            shortUuid: string;
            username: string;
            email: string | null;
            telegramId: string | null;
            status: string;
            expireAt: string;
            tag: string | null;
            onlineAt: string | null;
            lastConnectedNode: { name: string; countryCode: string } | null;
            usedBytes: string;
            baseLimitBytes: string;
            bonusBytes: string;
            limitBytes: string;
            paused: boolean;
            accessNow: boolean;
            unlimited: boolean;
        };
        // Materialize once: filtering, totals and pagination must use the same quota snapshot.
        const [result, all] = await Promise.all([
            sql<{
                users: Row[];
                total: number;
                usedBytes: string;
                pausedUsers: number;
                exhaustedUsers: number;
            }>`
            WITH matched AS MATERIALIZED (
                SELECT u.id::text AS id,u.short_uuid AS "shortUuid",u.username,u.email,u.telegram_id::text AS "telegramId",u.status,
                to_char(u.expire_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "expireAt",u.tag,
                q.used_bytes::text AS "usedBytes",q.base_limit::text AS "baseLimitBytes",q.bonus_bytes::text AS "bonusBytes",q.effective_limit::text AS "limitBytes",q.paused,
                COALESCE((SELECT a.unlimited FROM xera_limit_user_adjustments a WHERE a.kind=${kind} AND a.key=${key} AND a.user_id=u.id),false) AS unlimited,
                EXISTS(SELECT 1 FROM hosts h WHERE ((${kind}='HOST' AND h.uuid::text=${key}) OR (${kind}='TAG' AND ${key}=ANY(h.tags) AND h.use_tag_traffic_limit)) AND xera_host_user_allowed(u.id,h.uuid)) AS "accessNow"
                FROM users u CROSS JOIN LATERAL xera_limit_state(${kind},${key},u.id) q WHERE ${where}
            ), filtered AS MATERIALIZED (
                SELECT * FROM matched WHERE ${state}='ALL'
                OR (${state}='PAUSED' AND paused)
                OR (${state}='EXHAUSTED' AND "limitBytes"::numeric>0 AND "usedBytes"::numeric>="limitBytes"::numeric)
                OR (${state}='AVAILABLE' AND NOT paused AND "accessNow" AND ("limitBytes"='0' OR "usedBytes"::numeric<"limitBytes"::numeric))
                OR (${state}='UNAVAILABLE' AND NOT "accessNow")
            ), paged AS (SELECT * FROM filtered ORDER BY ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}),
            display_rows AS (
                SELECT p.*,to_char(ut.online_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "onlineAt",
                    CASE WHEN n.uuid IS NOT NULL THEN jsonb_build_object('name',n.name,'countryCode',n.country_code) END AS "lastConnectedNode"
                FROM paged p LEFT JOIN user_traffic ut ON ut.id=p.id::bigint
                LEFT JOIN nodes n ON n.uuid=ut.last_connected_node_uuid
            )
            SELECT (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY ${order}),'[]'::jsonb) FROM display_rows p) AS users,
                count(*)::integer AS total,COALESCE(sum("usedBytes"::numeric),0)::text AS "usedBytes",
                count(*) FILTER(WHERE paused)::integer AS "pausedUsers",
                count(*) FILTER(WHERE "limitBytes"::numeric>0 AND "usedBytes"::numeric>="limitBytes"::numeric)::integer AS "exhaustedUsers"
            FROM filtered`.execute(this.db.kysely),
            sql<{
                total: number;
            }>`SELECT count(*)::integer AS total FROM users u WHERE ${recipients}`.execute(
                this.db.kysely,
            ),
        ]);
        const row = result.rows[0];
        return {
            scope,
            users: row.users,
            total: row.total,
            allUsers: all.rows[0].total,
            page,
            pageSize,
            summary: {
                usedBytes: row.usedBytes,
                pausedUsers: row.pausedUsers,
                exhaustedUsers: row.exhaustedUsers,
            },
        };
    }
    async act(input: LimitAction) {
        const { kind, key, action, amountBytes, requestId, selection } = input;
        const fingerprint = JSON.stringify(selection);
        const recipients = sql`xera_limit_entitled(${kind},${key},u.id) AND ${limitSelectionPredicate(selection)}`;
        const result = await this.transactions.withTransaction({ timeout: 60000 }, async () => {
            await this.hosts.lockPolicies();
            await sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${requestId},20260927))`.execute(
                this.db.kysely,
            );
            const old = await sql<{
                kind: string;
                key: string;
                action: string;
                amountBytes: bigint;
                affectedUsers: number;
                selection: LimitSelection;
            }>`SELECT selection,kind,key,action,amount_bytes AS "amountBytes",affected_users AS "affectedUsers" FROM xera_limit_actions WHERE id=${requestId}::uuid`.execute(
                this.db.kysely,
            );
            if (old.rows[0]) {
                const previous = old.rows[0];
                if (
                    previous.kind !== kind ||
                    previous.key !== key ||
                    previous.action !== action ||
                    BigInt(previous.amountBytes) !== BigInt(amountBytes) ||
                    JSON.stringify(Object.entries(previous.selection).sort()) !==
                        JSON.stringify(Object.entries(selection).sort())
                )
                    throw new ConflictException('Идентификатор операции уже использован');
                return { affectedUsers: previous.affectedUsers, replayed: true };
            }
            const scope = await this.scope(kind, key);
            await this.validateSelection(selection);
            if (action === 'ADD' && BigInt(scope.limitBytes) <= 0n)
                throw new BadRequestException(
                    'Сначала задайте постоянную пользовательскую квоту: сейчас трафик не ограничен',
                );
            const hosts = await this.hosts.findAll();
            const selected = hosts.filter((h) =>
                kind === 'HOST' ? h.uuid === key : h.tags.includes(key) && h.useTagTrafficLimit,
            );
            if (action === 'PAUSE') {
                if (!selected.length)
                    throw new BadRequestException('В этой области пока нет хостов');
                // Verify every affected inbound supports host isolation before committing a pause.
                await this.hostsService.validatePolicyState(
                    hosts.map((h) =>
                        selected.some((s) => s.uuid === h.uuid)
                            ? Object.assign(Object.create(Object.getPrototypeOf(h)), h, {
                                  serverSpeedLimitMbps: h.serverSpeedLimitMbps || 1,
                              })
                            : h,
                    ),
                    [],
                    true,
                    new Set(selected.map((host) => host.uuid)),
                );
            }
            if (kind === 'TAG')
                await sql`INSERT INTO xera_host_tag_limits(tag,user_traffic_limit_bytes) VALUES(${key},0) ON CONFLICT DO NOTHING`.execute(
                    this.db.kysely,
                );
            await sql`INSERT INTO xera_limit_scopes(kind,key) VALUES(${kind},${key}) ON CONFLICT DO NOTHING`.execute(
                this.db.kysely,
            );
            // Freeze recipients once: a concurrent squad change must not change the
            // target set between counting, validating and applying this operation.
            await sql`CREATE TEMP TABLE xera_limit_action_recipients ON COMMIT DROP AS SELECT u.id FROM users u WHERE ${recipients}`.execute(
                this.db.kysely,
            );
            const selectedRecipients = sql`u.id IN (SELECT id FROM xera_limit_action_recipients)`;
            const count = await sql<{
                total: number;
            }>`SELECT count(*)::integer AS total FROM xera_limit_action_recipients`.execute(
                this.db.kysely,
            );
            if (selection.type === 'SELECTED' && count.rows[0].total !== selection.userIds.length)
                throw new BadRequestException(
                    'Часть выбранных пользователей не имеет доступа к этой области. Обновите список.',
                );
            if (selection.type !== 'ALL' && !count.rows[0].total)
                throw new BadRequestException('Нет пользователей с доступом к этой области');
            if (action === 'PAUSE' || action === 'RESUME') {
                if (selection.type === 'ALL') {
                    await sql`UPDATE xera_limit_scopes SET paused=${action === 'PAUSE'},updated_at=now() WHERE kind=${kind} AND key=${key}`.execute(
                        this.db.kysely,
                    );
                    if (action === 'RESUME')
                        await sql`UPDATE xera_limit_user_adjustments SET paused=false,updated_at=now() WHERE kind=${kind} AND key=${key}`.execute(
                            this.db.kysely,
                        );
                } else {
                    await sql`INSERT INTO xera_limit_user_adjustments(kind,key,user_id,window_start,paused)
      SELECT ${kind},${key},u.id,q.window_start,${action === 'PAUSE'} FROM users u CROSS JOIN LATERAL xera_limit_state(${kind},${key},u.id) q WHERE ${selectedRecipients}
      ON CONFLICT(kind,key,user_id) DO UPDATE SET paused=excluded.paused,updated_at=now()`.execute(
                        this.db.kysely,
                    );
                }
            } else if (action === 'UNLIMITED' || action === 'LIMITED') {
                // Personal override: never attach it to a squad or the scope itself.
                // Preserve period bonuses, reset baselines and independent pause flags.
                await sql`INSERT INTO xera_limit_user_adjustments(kind,key,user_id,window_start,unlimited)
                    SELECT ${kind},${key},u.id,q.window_start,${action === 'UNLIMITED'}
                    FROM users u CROSS JOIN LATERAL xera_limit_state(${kind},${key},u.id) q
                    WHERE ${selectedRecipients}
                    ON CONFLICT(kind,key,user_id) DO UPDATE SET unlimited=excluded.unlimited,updated_at=now()`.execute(
                    this.db.kysely,
                );
            } else {
                if (action === 'ADD') {
                    const overflow = await sql<{
                        bad: boolean;
                    }>`SELECT EXISTS(SELECT 1 FROM users u CROSS JOIN LATERAL xera_limit_state(${kind},${key},u.id) q WHERE ${selectedRecipients} AND q.base_limit+q.bonus_bytes+${amountBytes}::bigint>9007199254740991) AS bad`.execute(
                        this.db.kysely,
                    );
                    if (overflow.rows[0].bad)
                        throw new BadRequestException('Итоговая квота слишком велика');
                }
                await sql`INSERT INTO xera_limit_user_adjustments(kind,key,user_id,window_start,bonus_bytes,reset_base)
     SELECT ${kind},${key},u.id,q.window_start,
      CASE WHEN ${action}='ADD' THEN q.bonus_bytes+${amountBytes}::bigint ELSE q.bonus_bytes END,
      CASE WHEN ${action}='RESET' THEN COALESCE((SELECT jsonb_object_agg(r.bucket,r.raw_bytes::text) FROM xera_limit_raw(${kind},${key},u.id,q.window_start,1) r),'{}'::jsonb)
       ELSE COALESCE((SELECT a.reset_base FROM xera_limit_user_adjustments a WHERE a.kind=${kind} AND a.key=${key} AND a.user_id=u.id AND a.window_start=q.window_start),'{}'::jsonb) END
     FROM users u CROSS JOIN LATERAL xera_limit_state(${kind},${key},u.id) q WHERE ${selectedRecipients}
     ON CONFLICT(kind,key,user_id) DO UPDATE SET window_start=excluded.window_start,bonus_bytes=excluded.bonus_bytes,reset_base=excluded.reset_base,updated_at=now()`.execute(
                    this.db.kysely,
                );
            }
            await sql`INSERT INTO xera_limit_actions(id,kind,key,action,amount_bytes,affected_users,selection) VALUES(${requestId}::uuid,${kind},${key},${action},${amountBytes}::bigint,${count.rows[0].total},${fingerprint}::jsonb)`.execute(
                this.db.kysely,
            );
            return { affectedUsers: count.rows[0].total, replayed: false };
        });
        await this.policy.syncConnected();
        return { ...result, saved: true, enforcement: 'synchronizing' as const };
    }
}

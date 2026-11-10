import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { RawCacheService } from '@common/raw-cache';
import { fail, ok } from '@common/types';
import { stockHostPolicy } from '@common/xray-mode/stock-host-policy';
import { XrayModeService } from '@common/xray-mode/xray-mode.service';
import { CACHE_KEYS, CACHE_KEYS_TTL, ERRORS } from '@libs/contracts/constants';

import { HostWithRawInbound } from '@modules/hosts/entities/host-with-inbound-tag.entity';

import { withTemplateGeofilePolicy } from '../../../subscription-template/geofiles/template-geofile-policy';
import { HostTagLimitsRepository } from '../../repositories/host-tag-limits.repository';
import { HostsRepository } from '../../repositories/hosts.repository';
import {
    assignedXrayTemplates,
    indexXrayTemplateAssignments,
    recipientXrayTemplates,
} from '../../utils/xray-template-assignments';
import { GetHostsForUserQuery } from './get-hosts-for-user.query';

@QueryHandler(GetHostsForUserQuery)
export class GetHostsForUserHandler implements IQueryHandler<GetHostsForUserQuery> {
    private readonly logger = new Logger(GetHostsForUserHandler.name);
    private assignedTemplateLoads?: Map<
        string,
        Promise<Awaited<ReturnType<HostsRepository['getAssignedXrayTemplates']>>>
    >;
    constructor(
        private readonly hostsRepository: HostsRepository,
        private readonly tagLimitsRepository: HostTagLimitsRepository,
        private readonly rawCache: RawCacheService,
        private readonly xrayModes?: XrayModeService,
    ) {}

    async execute(query: GetHostsForUserQuery) {
        try {
            const custom = !this.xrayModes || (await this.xrayModes.isCustom());
            const hostsEntities = await this.hostsRepository.findActiveHostsByUserId(
                query.userId,
                query.returnDisabledHosts,
                query.returnHiddenHosts,
            );
            if (hostsEntities.length === 0) return ok([]);
            const [tagUsage, assignedTemplates] = await Promise.all([
                custom ? this.tagLimitsRepository.usageForUser(query.userId) : Promise.resolve([]),
                this.getAssignedTemplates(),
            ]);
            const assignments = indexXrayTemplateAssignments(assignedTemplates);

            const inboundUuids = new Set<string>();
            const templateUuids = new Set<string>();

            for (const h of hostsEntities) {
                if (h.configProfileInboundUuid) inboundUuids.add(h.configProfileInboundUuid);
                if (h.xrayJsonTemplateUuid) templateUuids.add(h.xrayJsonTemplateUuid);
            }

            const inbounds = await this.rawCache.cachedByKeys([...inboundUuids], {
                cacheKey: CACHE_KEYS.RAW_INBOUND,
                ttlSeconds: CACHE_KEYS_TTL.RAW_INBOUND,
                fetch: (m) => this.hostsRepository.getInboundsByUuids(m),
                rowId: (r) => r.uuid,
                toValue: (r) => ({ rawInbound: r.rawInbound, tag: r.tag }),
            });

            const templates = await this.rawCache.cachedByKeys([...templateUuids], {
                cacheKey: CACHE_KEYS.XRAY_JSON_TEMPLATE,
                templateGeneration: true,
                ttlSeconds: CACHE_KEYS_TTL.XRAY_JSON_TEMPLATE,
                fetch: (m) => this.hostsRepository.getTemplatesByUuids(m),
                rowId: (r) => r.uuid,
                toValue: (r) =>
                    r.templateJson
                        ? withTemplateGeofilePolicy(
                              r.templateJson as Record<string, unknown>,
                              r.geofilesEnabled === true,
                          )
                        : null,
            });

            return ok(
                hostsEntities.flatMap((h) => {
                    const inbound = h.configProfileInboundUuid
                        ? inbounds.get(h.configProfileInboundUuid)
                        : undefined;

                    if (!inbound) {
                        return [];
                    }

                    const limits = tagUsage.filter((item) => h.tags?.includes(item.tag));
                    const variants = h.xrayJsonTemplateUuid
                        ? recipientXrayTemplates(h, templates.get(h.xrayJsonTemplateUuid) ?? null)
                        : assignedXrayTemplates(h, assignments);
                    const result = new HostWithRawInbound({
                        ...h,
                        alwaysAvailable: h.alwaysAvailable && h.eligibleAlwaysAvailable,
                        rawInbound: inbound.rawInbound,
                        inboundTag: inbound.tag,
                        xrayJsonTemplate: variants[0]?.template ?? null,
                        xrayJsonVariants: variants.length > 1 ? variants : undefined,
                    });
                    result.tagTrafficLimits = limits.map((item) => ({
                        tag: item.tag,
                        speedLimitMbps: item.speedLimitMbps,
                        limitBytes: BigInt(item.limitBytes),
                        usedBytes: BigInt(item.usedBytes),
                        ambiguous: item.ambiguous,
                        paused: item.paused,
                        resetValue: item.resetValue,
                        resetUnit: item.resetUnit,
                        resetAnchorAt: item.resetAnchorAt,
                    }));
                    result.usedBytes = h.usedBytes;
                    result.trafficPaused = Boolean(h.trafficPaused);
                    result.effectiveLimitBytes = BigInt(
                        h.effectiveLimitBytes ?? h.userTrafficLimitBytes ?? 0,
                    );
                    result.ambiguousTraffic = Boolean(h.ambiguousTraffic);
                    return custom ? result : stockHostPolicy(result);
                }),
            );
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    private async getAssignedTemplates() {
        type Inventory = Awaited<ReturnType<HostsRepository['getAssignedXrayTemplates']>>;
        const key = 'remnacust:assigned-xray-template-inventory:v1';
        let generation: string;
        try {
            const snapshot = await this.rawCache.templateSnapshot<Inventory>(key);
            if (Array.isArray(snapshot.value)) return snapshot.value;
            generation = snapshot.generation;
        } catch {
            return this.hostsRepository.getAssignedXrayTemplates();
        }
        const loads = (this.assignedTemplateLoads ??= new Map());
        const pending = loads.get(generation);
        if (pending) return pending;
        if (loads.size >= 4) return this.hostsRepository.getAssignedXrayTemplates();
        const load = this.hostsRepository
            .getAssignedXrayTemplates()
            .then(async (rows) => {
                if (Buffer.byteLength(JSON.stringify(rows)) <= 4 * 1024 * 1024) {
                    try {
                        await this.rawCache.setTemplateSnapshot(key, generation, rows);
                    } catch {
                        return rows;
                    }
                }
                return rows;
            })
            .finally(() => {
                if (loads.get(generation) === load) loads.delete(generation);
            });
        loads.set(generation, load);
        return load;
    }
}

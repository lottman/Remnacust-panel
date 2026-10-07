import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { RawCacheService } from '@common/raw-cache';
import { fail, ok } from '@common/types';
import { CACHE_KEYS, CACHE_KEYS_TTL, ERRORS } from '@libs/contracts/constants';

import { HostWithRawInbound } from '@modules/hosts/entities/host-with-inbound-tag.entity';

import { HostTagLimitsRepository } from '../../repositories/host-tag-limits.repository';
import { HostsRepository } from '../../repositories/hosts.repository';
import { GetHostsForUserQuery } from './get-hosts-for-user.query';

@QueryHandler(GetHostsForUserQuery)
export class GetHostsForUserHandler implements IQueryHandler<GetHostsForUserQuery> {
    private readonly logger = new Logger(GetHostsForUserHandler.name);
    constructor(
        private readonly hostsRepository: HostsRepository,
        private readonly tagLimitsRepository: HostTagLimitsRepository,
        private readonly rawCache: RawCacheService,
    ) {}

    async execute(query: GetHostsForUserQuery) {
        try {
            const hostsEntities = await this.hostsRepository.findActiveHostsByUserId(
                query.userId,
                query.returnDisabledHosts,
                query.returnHiddenHosts,
            );
            const tagUsage = await this.tagLimitsRepository.usageForUser(query.userId);

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
                ttlSeconds: CACHE_KEYS_TTL.XRAY_JSON_TEMPLATE,
                fetch: (m) => this.hostsRepository.getTemplatesByUuids(m),
                rowId: (r) => r.uuid,
                toValue: (r) => r.templateJson,
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
                    const result = new HostWithRawInbound({
                        ...h,
                        alwaysAvailable: h.alwaysAvailable && h.eligibleAlwaysAvailable,
                        rawInbound: inbound.rawInbound,
                        inboundTag: inbound.tag,
                        xrayJsonTemplate: h.xrayJsonTemplateUuid
                            ? (templates.get(h.xrayJsonTemplateUuid) ?? null)
                            : null,
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
                    return result;
                }),
            );
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

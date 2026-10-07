import { Transactional } from '@nestjs-cls/transactional';
import { randomBytes } from 'node:crypto';

import {
    BadRequestException,
    HttpException,
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { AxiosService } from '@common/axios';
import { isIpDestinationRule } from '@common/host-policy/destination-rule';
import {
    HostPolicyService,
    normalizePolicyDomain,
    HOST_POLICY_VERSION,
} from '@common/host-policy/host-policy.service';
import { RawCacheService } from '@common/raw-cache';
import { fail, ok, TResult } from '@common/types';
import { cloneString } from '@common/utils/clone-string.util';
import { nullifyEmpty, wrapBigIntNullable } from '@common/utils/convert-type';
import { CACHE_KEYS } from '@libs/contracts/constants';
import { ERRORS } from '@libs/contracts/constants';
import { THostSniRegeneration } from '@libs/contracts/models';

import { GetConfigProfileByUuidQuery } from '@modules/config-profiles/queries/get-config-profile-by-uuid';
import { NodesRepository } from '@modules/nodes/repositories/nodes.repository';
import { GetSubscriptionTemplateByUuidQuery } from '@modules/subscription-template/queries/get-template-by-uuid';

import { NodesQueuesService } from '@queue/_nodes';

import {
    CreateHostBodyDto,
    ReorderHostsBodyDto,
    UpdateHostBodyDto,
    UpdateManyHostsBodyDto,
} from './dtos';
import { HostsEntity } from './entities/hosts.entity';
import { HostTagLimitsRepository } from './repositories/host-tag-limits.repository';
import { HostsRepository } from './repositories/hosts.repository';
import { requiresHostPolicy } from './utils/validate-host-policy';
import { validateHostPolicies } from './utils/validate-host-policy';

@Injectable()
export class HostsService {
    private readonly logger = new Logger(HostsService.name);
    private readonly quotaDay = () =>
        new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    constructor(
        private readonly hostsRepository: HostsRepository,
        private readonly tagLimitsRepository: HostTagLimitsRepository,
        private readonly queryBus: QueryBus,
        private readonly nodesRepository: NodesRepository,
        private readonly nodesQueuesService: NodesQueuesService,
        private readonly rawCache: RawCacheService,
        private readonly nodeAxios: AxiosService,
        private readonly hostPolicies: HostPolicyService,
    ) {}

    @Transactional()
    public async createHost(dto: CreateHostBodyDto): Promise<TResult<HostsEntity>> {
        try {
            await this.hostsRepository.lockPolicies();
            if (dto.onlyWhenInactive && !dto.alwaysAvailable)
                throw new BadRequestException('Enable availability after subscription ends first');
            if (dto.trafficLimitResetUnit === 'MONTHS' && (dto.trafficLimitResetValue ?? 0) > 120) {
                throw new BadRequestException('Monthly reset period must be at most 120 months');
            }

            const policyBefore = await this.hostsRepository.findAll();
            if (dto.xrayJsonTemplateUuid) {
                const xrayJsonTemplate = await this.queryBus.execute(
                    new GetSubscriptionTemplateByUuidQuery(dto.xrayJsonTemplateUuid),
                );

                if (!xrayJsonTemplate.isOk) {
                    return fail(ERRORS.SUBSCRIPTION_TEMPLATE_NOT_FOUND);
                }

                if (xrayJsonTemplate.response.templateType !== 'XRAY_JSON') {
                    return fail(ERRORS.TEMPLATE_TYPE_NOT_ALLOWED);
                }
            }

            const {
                inbound: inboundObj,
                nodes,
                internalSquads,
                xhttpExtraParams,
                muxParams,
                sockoptParams,
                finalMask,
                userTrafficLimitBytes,
                trafficMultiplier,
                ...rest
            } = dto;

            const configProfile = await this.queryBus.execute(
                new GetConfigProfileByUuidQuery(inboundObj.configProfileUuid),
            );

            if (!configProfile.isOk) {
                return fail(ERRORS.CONFIG_PROFILE_NOT_FOUND);
            }

            const configProfileInbound = configProfile.response.inbounds.find(
                (inbound) => inbound.uuid === inboundObj.configProfileInboundUuid,
            );
            if (!configProfileInbound) {
                return fail(ERRORS.CONFIG_PROFILE_INBOUND_NOT_FOUND_IN_SPECIFIED_PROFILE);
            }

            const hostEntity = new HostsEntity({
                ...rest,
                trafficMultiplier,
                userTrafficLimitBytes: wrapBigIntNullable(userTrafficLimitBytes) ?? null,
                trafficLimitResetValue: dto.trafficLimitResetValue ?? 0,
                trafficLimitResetUnit: dto.trafficLimitResetUnit ?? 'DAYS',
                trafficLimitResetAnchorAt: this.quotaDay(),
                address: dto.address.trim(),
                xhttpExtraParams: nullifyEmpty(xhttpExtraParams),
                muxParams: nullifyEmpty(muxParams),
                sockoptParams: nullifyEmpty(sockoptParams),
                finalMask: nullifyEmpty(finalMask),
                configProfileUuid: configProfile.response.uuid,
                configProfileInboundUuid: configProfileInbound.uuid,
                internalSquadsMode: internalSquads?.mode,
            });

            const result = await this.hostsRepository.create(hostEntity);

            if (nodes !== undefined && nodes.length > 0) {
                await this.hostsRepository.addNodesToHost(result.uuid, nodes);
                result.nodes = nodes.map((node) => {
                    return {
                        nodeUuid: node,
                    };
                });
            }

            if (internalSquads !== undefined && internalSquads.squads.length > 0) {
                await this.hostsRepository.addInternalSquadsToHost(
                    result.uuid,
                    internalSquads.squads,
                );
                result.internalSquads = internalSquads.squads.map((squad) => {
                    return {
                        squadUuid: squad,
                    };
                });
            }

            await this.syncExceptionPolicy(policyBefore);
            return ok(result);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            this.logger.error(error);

            return fail(ERRORS.CREATE_HOST_ERROR);
        }
    }

    @Transactional()
    public async updateHost(dto: UpdateHostBodyDto): Promise<TResult<HostsEntity>> {
        try {
            await this.hostsRepository.lockPolicies();
            const policyBefore = await this.hostsRepository.findAll();
            const {
                inbound: inboundObj,
                nodes,
                internalSquads,
                userTrafficLimitBytes,
                trafficMultiplier,
                ...rest
            } = dto;

            const host = await this.hostsRepository.findByUUID(dto.uuid);
            if (!host) return fail(ERRORS.HOST_NOT_FOUND);
            if (
                (dto.onlyWhenInactive ?? host.onlyWhenInactive) &&
                !(dto.alwaysAvailable ?? host.alwaysAvailable)
            )
                throw new BadRequestException('Enable availability after subscription ends first');
            const nextResetValue = dto.trafficLimitResetValue ?? host.trafficLimitResetValue;
            const nextResetUnit = dto.trafficLimitResetUnit ?? host.trafficLimitResetUnit;
            if (nextResetUnit === 'MONTHS' && nextResetValue > 120) {
                throw new BadRequestException('Monthly reset period must be at most 120 months');
            }
            const requestedLimit =
                userTrafficLimitBytes === undefined
                    ? host.userTrafficLimitBytes
                    : userTrafficLimitBytes == null
                      ? null
                      : BigInt(userTrafficLimitBytes);
            const restartQuota =
                nextResetValue !== host.trafficLimitResetValue ||
                (nextResetValue > 0 && nextResetUnit !== host.trafficLimitResetUnit) ||
                ((host.userTrafficLimitBytes == null || host.userTrafficLimitBytes === 0n) &&
                    requestedLimit != null &&
                    requestedLimit > 0n);
            if (dto.xrayJsonTemplateUuid) {
                const xrayJsonTemplate = await this.queryBus.execute(
                    new GetSubscriptionTemplateByUuidQuery(dto.xrayJsonTemplateUuid),
                );

                if (!xrayJsonTemplate.isOk) {
                    return fail(ERRORS.SUBSCRIPTION_TEMPLATE_NOT_FOUND);
                }

                if (xrayJsonTemplate.response.templateType !== 'XRAY_JSON') {
                    return fail(ERRORS.TEMPLATE_TYPE_NOT_ALLOWED);
                }
            }

            let xhttpExtraParams: null | object | undefined;
            if (dto.xhttpExtraParams !== undefined && dto.xhttpExtraParams !== null) {
                xhttpExtraParams = dto.xhttpExtraParams;
            } else if (dto.xhttpExtraParams === null) {
                xhttpExtraParams = null;
            } else {
                xhttpExtraParams = undefined;
            }

            let muxParams: null | object | undefined;
            if (dto.muxParams !== undefined && dto.muxParams !== null) {
                if (Object.keys(dto.muxParams).length === 0) {
                    muxParams = null;
                } else {
                    muxParams = dto.muxParams;
                }
            } else if (dto.muxParams === null) {
                muxParams = null;
            } else {
                muxParams = undefined;
            }

            let sockoptParams: null | object | undefined;
            if (dto.sockoptParams !== undefined && dto.sockoptParams !== null) {
                if (Object.keys(dto.sockoptParams).length === 0) {
                    sockoptParams = null;
                } else {
                    sockoptParams = dto.sockoptParams;
                }
            } else if (dto.sockoptParams === null) {
                sockoptParams = null;
            } else {
                sockoptParams = undefined;
            }

            let serverDescription: null | string | undefined;
            if (dto.serverDescription !== undefined && dto.serverDescription !== null) {
                serverDescription = dto.serverDescription;
            } else if (dto.serverDescription === null) {
                serverDescription = null;
            } else {
                serverDescription = undefined;
            }

            let finalMask: null | object | undefined;
            if (dto.finalMask !== undefined && dto.finalMask !== null) {
                finalMask = dto.finalMask;
            } else if (dto.finalMask === null) {
                finalMask = null;
            } else {
                finalMask = undefined;
            }

            let configProfileUuid: string | undefined;
            let configProfileInboundUuid: string | undefined;
            if (inboundObj) {
                const configProfile = await this.queryBus.execute(
                    new GetConfigProfileByUuidQuery(inboundObj.configProfileUuid),
                );

                if (!configProfile.isOk) {
                    return fail(ERRORS.CONFIG_PROFILE_NOT_FOUND);
                }

                const configProfileInbound = configProfile.response.inbounds.find(
                    (inbound) => inbound.uuid === inboundObj.configProfileInboundUuid,
                );

                if (!configProfileInbound) {
                    return fail(ERRORS.CONFIG_PROFILE_INBOUND_NOT_FOUND_IN_SPECIFIED_PROFILE);
                }

                configProfileUuid = configProfile.response.uuid;
                configProfileInboundUuid = configProfileInbound.uuid;
            }

            if (nodes !== undefined) {
                await this.hostsRepository.clearNodesFromHost(host.uuid);
                await this.hostsRepository.addNodesToHost(host.uuid, nodes);
            }

            if (internalSquads !== undefined) {
                await this.hostsRepository.clearInternalSquadsFromHost(host.uuid);
                await this.hostsRepository.addInternalSquadsToHost(
                    host.uuid,
                    internalSquads.squads,
                );
            }

            const result = await this.hostsRepository.update({
                ...rest,
                trafficMultiplier,
                userTrafficLimitBytes: wrapBigIntNullable(userTrafficLimitBytes),
                trafficLimitResetValue: nextResetValue,
                trafficLimitResetUnit: nextResetUnit,
                trafficLimitResetAnchorAt: restartQuota
                    ? this.quotaDay()
                    : host.trafficLimitResetAnchorAt,
                address: dto.address ? dto.address.trim() : undefined,
                xhttpExtraParams,
                muxParams,
                sockoptParams,
                configProfileUuid,
                configProfileInboundUuid,
                serverDescription,
                finalMask,
                internalSquadsMode: internalSquads?.mode,
            });

            await this.syncExceptionPolicy(policyBefore);
            return ok(result);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            this.logger.error(error);

            return fail(ERRORS.UPDATE_HOST_ERROR);
        }
    }

    @Transactional()
    public async deleteHost(hostUuid: string): Promise<TResult<boolean>> {
        try {
            await this.hostsRepository.lockPolicies();
            const policyBefore = await this.hostsRepository.findAll();
            const host = await this.hostsRepository.findByUUID(hostUuid);
            if (!host) {
                return fail(ERRORS.HOST_NOT_FOUND);
            }
            await this.hostsRepository.deleteByUUID(host.uuid);

            await this.syncExceptionPolicy(policyBefore);
            return ok(true);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            this.logger.error(error);
            this.logger.error(JSON.stringify(error));
            return fail(ERRORS.DELETE_HOST_ERROR);
        }
    }

    public async getHosts(): Promise<TResult<HostsEntity[]>> {
        try {
            const result = await this.hostsRepository.findAll();

            return ok(result);
        } catch (error) {
            this.logger.error(JSON.stringify(error));
            return fail(ERRORS.GET_ALL_HOSTS_ERROR);
        }
    }

    public async getHost(hostUuid: string): Promise<TResult<HostsEntity>> {
        try {
            const result = await this.hostsRepository.findByUUID(hostUuid);

            if (!result) {
                return fail(ERRORS.HOST_NOT_FOUND);
            }

            return ok(result);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            this.logger.error(error);
            return fail(ERRORS.GET_ONE_HOST_ERROR);
        }
    }

    public async cloneHost(cloneFromUuid: string): Promise<TResult<HostsEntity>> {
        try {
            const host = await this.hostsRepository.findByUUID(cloneFromUuid);

            if (!host) {
                return fail(ERRORS.HOST_NOT_FOUND);
            }

            return ok(await this.cloneHostTransactional(host));
        } catch (error) {
            if (error instanceof HttpException) throw error;
            this.logger.error(error);

            return fail(ERRORS.CLONE_HOST_ERROR);
        }
    }

    @Transactional()
    private async cloneHostTransactional(host: HostsEntity): Promise<HostsEntity> {
        await this.hostsRepository.lockPolicies();
        await this.hostsRepository.shiftViewPositionsAfter(host.viewPosition);

        const { uuid: _uuid, nodes, internalSquads, ...rest } = host;

        const clone = await this.hostsRepository.create(
            new HostsEntity({
                ...rest,
                remark: cloneString(host.remark),
                isDisabled: true,
                viewPosition: host.viewPosition + 1,
            }),
        );

        if (nodes.length > 0) {
            await this.hostsRepository.addNodesToHost(
                clone.uuid,
                nodes.map((node) => node.nodeUuid),
            );

            clone.nodes = nodes;
        }

        if (internalSquads.length > 0) {
            await this.hostsRepository.addInternalSquadsToHost(
                clone.uuid,
                internalSquads.map((internalSquad) => internalSquad.squadUuid),
            );

            clone.internalSquads = internalSquads;
        }

        await this.hostsRepository.syncViewPositionSequence();

        await this.validatePolicyState(
            await this.hostsRepository.findAll(),
            await this.tagLimitsRepository.list(),
            true,
            new Set([clone.uuid]),
        );
        return clone;
    }

    public async reorderHosts(dto: ReorderHostsBodyDto): Promise<
        TResult<{
            isUpdated: boolean;
        }>
    > {
        try {
            const result = await this.hostsRepository.reorderMany(dto.hosts);

            return ok({ isUpdated: result });
        } catch (error) {
            if (error instanceof HttpException) throw error;
            this.logger.error(error);
            return fail(ERRORS.REORDER_HOSTS_ERROR);
        }
    }

    @Transactional()
    public async deleteHosts(uuids: string[]): Promise<TResult<boolean>> {
        try {
            await this.hostsRepository.lockPolicies();
            const policyBefore = await this.hostsRepository.findAll();
            await this.hostsRepository.deleteMany(uuids);

            await this.syncExceptionPolicy(policyBefore);
            return ok(true);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            this.logger.error(error);
            return fail(ERRORS.DELETE_HOSTS_ERROR);
        }
    }

    @Transactional()
    public async bulkEnableHosts(uuids: string[]): Promise<TResult<boolean>> {
        try {
            await this.hostsRepository.lockPolicies();
            const policyBefore = await this.hostsRepository.findAll();
            await this.hostsRepository.enableMany(uuids);

            await this.syncExceptionPolicy(policyBefore);
            return ok(true);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            this.logger.error(error);
            return fail(ERRORS.BULK_ENABLE_HOSTS_ERROR);
        }
    }

    @Transactional()
    public async bulkDisableHosts(uuids: string[]): Promise<TResult<boolean>> {
        try {
            await this.hostsRepository.lockPolicies();
            const policyBefore = await this.hostsRepository.findAll();
            await this.hostsRepository.disableMany(uuids);

            await this.syncExceptionPolicy(policyBefore);
            return ok(true);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            this.logger.error(error);
            return fail(ERRORS.BULK_DISABLE_HOSTS_ERROR);
        }
    }

    public async getHostsTags(): Promise<TResult<string[]>> {
        try {
            const result = await this.hostsRepository.findAllTags();

            return ok(result);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            this.logger.error(error);
            return fail(ERRORS.GET_ALL_HOST_TAGS_ERROR);
        }
    }

    @Transactional()
    public async updateManyHosts(dto: UpdateManyHostsBodyDto): Promise<TResult<boolean>> {
        try {
            await this.hostsRepository.lockPolicies();
            const availabilityHosts = await this.hostsRepository.findAll();
            if (
                availabilityHosts.some(
                    (host) =>
                        dto.uuids.includes(host.uuid) &&
                        (dto.onlyWhenInactive ?? host.onlyWhenInactive) &&
                        !(dto.alwaysAvailable ?? host.alwaysAvailable),
                )
            )
                throw new BadRequestException('Enable availability after subscription ends first');
            if (
                availabilityHosts.some(
                    (host) =>
                        dto.uuids.includes(host.uuid) &&
                        (dto.trafficLimitResetUnit ?? host.trafficLimitResetUnit) === 'MONTHS' &&
                        (dto.trafficLimitResetValue ?? host.trafficLimitResetValue) > 120,
                )
            ) {
                throw new BadRequestException('Monthly reset period must be at most 120 months');
            }
            const policyBefore = await this.hostsRepository.findAll();
            const {
                uuids,
                inbound: inboundObj,
                nodes,
                internalSquads,
                userTrafficLimitBytes,
                trafficMultiplier,
                xhttpExtraParams,
                muxParams,
                sockoptParams,
                finalMask,
                ...rest
            } = dto;

            if (dto.xrayJsonTemplateUuid) {
                const xrayJsonTemplate = await this.queryBus.execute(
                    new GetSubscriptionTemplateByUuidQuery(dto.xrayJsonTemplateUuid),
                );

                if (!xrayJsonTemplate.isOk) {
                    return fail(ERRORS.SUBSCRIPTION_TEMPLATE_NOT_FOUND);
                }

                if (xrayJsonTemplate.response.templateType !== 'XRAY_JSON') {
                    return fail(ERRORS.TEMPLATE_TYPE_NOT_ALLOWED);
                }
            }

            let configProfileUuid: string | undefined;
            let configProfileInboundUuid: string | undefined;
            if (inboundObj) {
                const configProfile = await this.queryBus.execute(
                    new GetConfigProfileByUuidQuery(inboundObj.configProfileUuid),
                );

                if (!configProfile.isOk) {
                    return fail(ERRORS.CONFIG_PROFILE_NOT_FOUND);
                }

                const configProfileInbound = configProfile.response.inbounds.find(
                    (inbound) => inbound.uuid === inboundObj.configProfileInboundUuid,
                );

                if (!configProfileInbound) {
                    return fail(ERRORS.CONFIG_PROFILE_INBOUND_NOT_FOUND_IN_SPECIFIED_PROFILE);
                }

                configProfileUuid = configProfile.response.uuid;
                configProfileInboundUuid = configProfileInbound.uuid;
            }

            if (nodes !== undefined) {
                await this.hostsRepository.clearNodesFromHosts(uuids);
                await this.hostsRepository.addNodesToHosts(uuids, nodes);
            }

            if (internalSquads !== undefined) {
                await this.hostsRepository.clearInternalSquadsFromHosts(uuids);
                await this.hostsRepository.addInternalSquadsToHosts(uuids, internalSquads.squads);
            }

            await this.hostsRepository.updateMany({
                uuids,
                data: {
                    ...rest,
                    trafficMultiplier,
                    userTrafficLimitBytes: wrapBigIntNullable(userTrafficLimitBytes),

                    address: dto.address ? dto.address.trim() : undefined,
                    xhttpExtraParams: nullifyEmpty(xhttpExtraParams),
                    muxParams: nullifyEmpty(muxParams),
                    sockoptParams: nullifyEmpty(sockoptParams),
                    finalMask: nullifyEmpty(finalMask),
                    configProfileUuid,
                    configProfileInboundUuid,
                    internalSquadsMode: internalSquads?.mode,
                },
            });

            const resetUuids = policyBefore
                .filter(
                    (host) =>
                        uuids.includes(host.uuid) &&
                        ((dto.trafficLimitResetValue ?? host.trafficLimitResetValue) !==
                            host.trafficLimitResetValue ||
                            ((dto.trafficLimitResetValue ?? host.trafficLimitResetValue) > 0 &&
                                (dto.trafficLimitResetUnit ?? host.trafficLimitResetUnit) !==
                                    host.trafficLimitResetUnit) ||
                            ((host.userTrafficLimitBytes == null ||
                                host.userTrafficLimitBytes === 0n) &&
                                dto.userTrafficLimitBytes != null &&
                                BigInt(dto.userTrafficLimitBytes) > 0n)),
                )
                .map((host) => host.uuid);
            if (resetUuids.length)
                await this.hostsRepository.updateMany({
                    uuids: resetUuids,
                    data: { trafficLimitResetAnchorAt: this.quotaDay() },
                });

            await this.syncExceptionPolicy(policyBefore);
            return ok(true);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            this.logger.error(error);
            return fail(ERRORS.UPDATE_HOSTS_ERROR);
        }
    }

    public async regenerateHostSni(uuid: string): Promise<TResult<HostsEntity>> {
        try {
            const host = await this.hostsRepository.findByUUID(uuid);
            if (!host) {
                return fail(ERRORS.HOST_NOT_FOUND);
            }
            const settings = host.sniRegeneration as THostSniRegeneration | null;
            if (!settings?.enabled || !settings.pool?.length) {
                return fail(ERRORS.HOST_SNI_REGENERATION_NOT_CONFIGURED);
            }
            const result = await this.rotateHostSni(host, settings);
            return ok(result);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            this.logger.error(error);
            return fail(ERRORS.HOST_SNI_REGENERATION_ERROR);
        }
    }

    public async rotateHostSni(
        host: HostsEntity,
        settings: THostSniRegeneration,
    ): Promise<HostsEntity> {
        const sni =
            settings.pool[
                Math.floor(Date.now() / (settings.intervalHours * 3_600_000)) % settings.pool.length
            ];
        if (settings.rotateShortIds && host.configProfileInboundUuid) {
            const count = settings.shortIdCount ?? 1;
            const freshIds = Array.from({ length: count }, () =>
                randomBytes(Math.ceil(settings.shortIdLength / 2))
                    .toString('hex')
                    .slice(0, settings.shortIdLength),
            );
            await this.hostsRepository.regenerateInboundShortIds(
                host.configProfileInboundUuid,
                freshIds,
            );
            await this.rawCache.delMany([CACHE_KEYS.RAW_INBOUND(host.configProfileInboundUuid)]);
        }
        const updated = await this.hostsRepository.update({
            uuid: host.uuid,
            sni,
            sniRegeneration: { ...settings, lastRotatedAt: new Date().toISOString() },
        });
        await this.restartProfileNodes(host.configProfileUuid);
        return updated;
    }

    private async restartProfileNodes(profileUuid: string | null): Promise<void> {
        if (!profileUuid) return;
        const nodes = await this.nodesRepository.findByCriteria({ isDisabled: false });
        for (const node of nodes) {
            if (node.activeConfigProfileUuid === profileUuid) {
                await this.nodesQueuesService.startNode({ nodeUuid: node.uuid, force: false });
            }
        }
    }

    public async validatePolicyState(
        hosts: HostsEntity[],
        limits: { tag: string }[],
        checkCapabilities = true,
        affectedHostIds?: ReadonlySet<string>,
    ): Promise<void> {
        // A change to one host/tag must not depend on unrelated nodes in the fleet.
        // Keep every binding of the affected inbound: those nodes may hold issued keys.
        hosts = hosts.filter((host) => !affectedHostIds || affectedHostIds.has(host.uuid));
        if (!hosts.length) return;
        const managed = await this.hostsRepository.managedPolicyHostIds();
        const policyHosts = hosts.map((host) => ({ ...host, managed: managed.has(host.uuid) }));
        validateHostPolicies(policyHosts, limits, await this.hostsRepository.policyBindings());
        if (!checkCapabilities) return;
        const bindings = await this.hostsRepository.policyBindings();
        const protectedInbounds = new Set(
            policyHosts
                .filter((h) => requiresHostPolicy(h, limits))
                .map((h) => h.configProfileInboundUuid),
        );
        for (const host of hosts) {
            const domains = host.domainRules as { mode?: string; domains: string[] } | null;
            if (domains?.mode && domains.mode !== 'OFF') {
                try {
                    domains.domains.forEach(normalizePolicyDomain);
                } catch {
                    throw new BadRequestException(
                        'Укажите корректный домен, IP, CIDR или HTTP(S) URL; geosite и regexp не поддерживаются',
                    );
                }
            }
        }
        const limitedIds = new Set(
            bindings
                .filter((b) => protectedInbounds.has(b.configProfileInboundUuid))
                .map((b) => b.nodeUuid),
        );
        if (!limitedIds.size) return;
        const nodes = (await this.nodesRepository.findAllNodes()).filter((n) =>
            limitedIds.has(n.uuid),
        );
        for (let i = 0; i < nodes.length; i += 8) {
            await Promise.all(
                nodes.slice(i, i + 8).map(async (node) => {
                    const response = await this.nodeAxios.hostPolicy<{
                        supported: boolean;
                        destinationRulesSupported?: boolean;
                        version?: string;
                    }>(node);
                    if (
                        !response.isOk ||
                        !response.response?.supported ||
                        response.response.version !== HOST_POLICY_VERSION
                    ) {
                        throw new ServiceUnavailableException(
                            `Node ${node.name}: не подтверждена поддержка изоляции хостов (host-policy-v2). Нужны совместимые нода и Xray; официальный Latest сам по себе не добавляет эту функцию. Проверьте также доступность ноды.`,
                        );
                    }
                    const requiresDestinations = hosts.some((host) => {
                        const rules = host.domainRules as {
                            mode: string;
                            domains: string[];
                        } | null;
                        return (
                            rules &&
                            rules.mode !== 'OFF' &&
                            rules.domains.some((rule) =>
                                isIpDestinationRule(normalizePolicyDomain(rule)),
                            ) &&
                            bindings.some(
                                (binding) =>
                                    binding.nodeUuid === node.uuid &&
                                    binding.configProfileInboundUuid ===
                                        host.configProfileInboundUuid,
                            )
                        );
                    });
                    if (requiresDestinations && !response.response.destinationRulesSupported)
                        throw new ServiceUnavailableException(
                            `Node ${node.name}: обновите ноду и Xray для правил IP и CIDR`,
                        );
                }),
            );
        }
    }

    private async syncExceptionPolicy(before: HostsEntity[]): Promise<void> {
        const after = await this.hostsRepository.findAll();
        const enforcement = (h: HostsEntity) =>
            JSON.stringify({
                uuid: h.uuid,
                inbound: h.configProfileInboundUuid,
                tags: [...h.tags].sort(),
                nodes: h.nodes.map((n) => n.nodeUuid).sort(),
                quota: h.userTrafficLimitBytes?.toString() ?? null,
                speed: h.serverSpeedLimitMbps,
                useTagTrafficLimit: h.useTagTrafficLimit,
                useTagSpeedLimit: h.useTagSpeedLimit,
                useTagTotalSpeedLimit: h.useTagTotalSpeedLimit,
                trafficMultiplier: h.trafficMultiplier,
                totalSpeed: h.totalSpeedLimitMbps,
                resetValue: h.trafficLimitResetValue,
                resetUnit: h.trafficLimitResetUnit,
                inactive: h.onlyWhenInactive,
                available: h.alwaysAvailable,
                domains: h.domainRules,
            });
        const previous = new Map(before.map((host) => [host.uuid, enforcement(host)]));
        const changed = new Set(
            after
                .filter((host) => previous.get(host.uuid) !== enforcement(host))
                .map((host) => host.uuid),
        );
        await this.validatePolicyState(
            after,
            await this.tagLimitsRepository.list(),
            changed.size > 0,
            changed,
        );
        // Host access, quotas and speed rules are reloaded by host-policy-v2.
        // A full startNode here interrupts every inbound in the profile and races the commit.
    }

    public async synchronizeCommittedPolicies(): Promise<void> {
        // Controllers call this after the transactional service method has committed.
        // The scheduled sync retries unavailable nodes without rolling back saved settings.
        try {
            await this.hostPolicies.syncConnected();
        } catch (error) {
            this.logger.error(
                `Host settings saved; policy synchronization will retry: ${String(error)}`,
            );
        }
    }
}

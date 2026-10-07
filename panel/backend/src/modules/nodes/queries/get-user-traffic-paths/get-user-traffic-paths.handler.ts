import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';

import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';

import { fail, ok } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import { GetHostsForUserQuery } from '@modules/hosts/queries/get-hosts-for-user';
import { GetUserByUniqueFieldQuery } from '@modules/users/queries/get-user-by-unique-field';

import { GetUserTrafficPathsQuery } from './get-user-traffic-paths.query';

type XrayRule = {
    outboundTag?: string;
    inboundTag?: string;
    domain?: string[];
    ip?: string[];
    port?: string;
    network?: string;
    protocol?: string[];
};

type ProfileConfig = {
    routing?: { domainStrategy?: string; rules?: XrayRule[] };
    outbounds?: Array<{
        tag?: string;
        protocol?: string;
        settings?: {
            vnext?: Array<{ address?: string }>;
            servers?: Array<{ address?: string }>;
            address?: string;
        };
    }>;
};

type HostRow = {
    uuid: string;
    remark: string;
    address: string;
    port: number;
    isDisabled: boolean;
    isHidden: boolean;
    alwaysAvailable: boolean;
    domainRules: unknown;
    userTrafficLimitBytes: bigint | null;
    speedLimitMbps: number | null;
    configProfileInboundUuid: string | null;
    configProfileUuid: string | null;
    nodes: { nodeUuid: string }[];
    usedBytes: bigint | string | null;
    ambiguousTraffic?: boolean;
    tagTrafficLimits?: { tag: string; limitBytes: bigint; usedBytes: bigint; ambiguous: boolean }[];
    eligibleAlwaysAvailable?: boolean;
};

@QueryHandler(GetUserTrafficPathsQuery)
export class GetUserTrafficPathsHandler implements IQueryHandler<GetUserTrafficPathsQuery> {
    private readonly logger = new Logger(GetUserTrafficPathsHandler.name);

    constructor(
        private readonly prisma: TransactionHost<TransactionalAdapterPrisma>,
        private readonly queryBus: QueryBus,
    ) {}

    private async loadHosts(): Promise<HostRow[]> {
        const allHosts = await this.prisma.tx.hosts.findMany({
            include: { nodes: { select: { nodeUuid: true } } },
        });
        return allHosts.map((host) => ({
            ...host,
            eligibleAlwaysAvailable: true,
            usedBytes: null,
        })) as HostRow[];
    }

    private async loadUser(shortUuid: string) {
        const userResult = await this.queryBus.execute(
            new GetUserByUniqueFieldQuery({ shortUuid }),
        );
        if (!userResult.isOk) {
            return null;
        }
        return userResult.response;
    }

    async execute(query: GetUserTrafficPathsQuery) {
        try {
            let user: NonNullable<Awaited<ReturnType<typeof this.loadUser>>> | null = null;
            let hosts: HostRow[] = [];

            if (query.userShortUuid) {
                const loaded = await this.loadUser(query.userShortUuid);
                if (!loaded) {
                    return fail(ERRORS.USER_NOT_FOUND);
                }
                user = loaded;
                const hostsResult = await this.queryBus.execute(
                    new GetHostsForUserQuery(user.id, false, true),
                );
                if (!hostsResult.isOk) {
                    return fail(ERRORS.INTERNAL_SERVER_ERROR);
                }
                hosts = hostsResult.response as unknown as HostRow[];
            } else {
                hosts = await this.loadHosts();
            }

            const profiles = await this.prisma.tx.configProfiles.findMany({
                include: {
                    configProfileInbounds: true,
                    nodes: { select: { uuid: true, name: true, isDisabled: true } },
                },
            });

            const inboundToNodes = await this.prisma.tx.configProfileInboundsToNodes.findMany({
                select: { configProfileInboundUuid: true, nodeUuid: true },
            });
            const nodeRows = await this.prisma.tx.nodes.findMany({
                select: {
                    uuid: true,
                    name: true,
                    isDisabled: true,
                    activeConfigProfileUuid: true,
                },
            });
            const nodeNameByUuid = new Map(nodeRows.map((node) => [node.uuid, node.name]));
            const nodesByInbound = new Map<string, string[]>();
            for (const link of inboundToNodes) {
                const list = nodesByInbound.get(link.configProfileInboundUuid) ?? [];
                list.push(link.nodeUuid);
                nodesByInbound.set(link.configProfileInboundUuid, list);
            }

            const profileDtos = profiles.map((profile) => {
                const config = (profile.config ?? {}) as ProfileConfig;
                const activeNodes = nodeRows
                    .filter((node) => node.activeConfigProfileUuid === profile.uuid)
                    .map((node) => ({
                        uuid: node.uuid,
                        name: node.name,
                        isDisabled: node.isDisabled,
                    }));

                const routingRules = (config.routing?.rules ?? []).map((rule) => ({
                    outboundTag: rule.outboundTag ?? null,
                    inboundTag: rule.inboundTag ?? null,
                    domains: Array.isArray(rule.domain) ? rule.domain.slice(0, 200) : null,
                    ip: Array.isArray(rule.ip) ? rule.ip.slice(0, 200) : null,
                    port: rule.port ?? null,
                    network: rule.network ?? null,
                    protocol: Array.isArray(rule.protocol) ? rule.protocol : null,
                }));

                const outbounds = (config.outbounds ?? [])
                    .filter((outbound) => typeof outbound.tag === 'string')
                    .map((outbound) => {
                        let exit: string | null = null;
                        if (outbound.protocol === 'blackhole') exit = 'BLOCK (blackhole)';
                        else if (outbound.protocol === 'freedom') exit = 'DIRECT from node';
                        else if (outbound.protocol === 'dns') exit = 'DNS';
                        else {
                            exit =
                                outbound.settings?.vnext?.[0]?.address ??
                                outbound.settings?.servers?.[0]?.address ??
                                outbound.settings?.address ??
                                null;
                        }
                        return {
                            tag: outbound.tag as string,
                            protocol: outbound.protocol ?? null,
                            exit,
                        };
                    });

                return {
                    uuid: profile.uuid,
                    name: profile.name,
                    isActive: activeNodes.length > 0,
                    nodes: activeNodes,
                    inbounds: profile.configProfileInbounds.map((inbound) => ({
                        uuid: inbound.uuid,
                        tag: inbound.tag,
                        type: inbound.type,
                        network: inbound.network,
                        security: inbound.security,
                        port: inbound.port,
                    })),
                    routing: {
                        domainStrategy: config.routing?.domainStrategy ?? null,
                        rules: routingRules,
                    },
                    outbounds,
                };
            });

            const inboundByUuid = new Map(
                profileDtos.flatMap((profile) =>
                    profile.inbounds.map((inbound) => [inbound.uuid, inbound] as const),
                ),
            );
            const profileUuidByInbound = new Map(
                profileDtos.flatMap((profile) =>
                    profile.inbounds.map((inbound) => [inbound.uuid, profile.uuid] as const),
                ),
            );

            const hostDtos = hosts.map((host) => {
                const inbound = host.configProfileInboundUuid
                    ? (inboundByUuid.get(host.configProfileInboundUuid) ?? null)
                    : null;
                const profileUuid = host.configProfileInboundUuid
                    ? (profileUuidByInbound.get(host.configProfileInboundUuid) ?? null)
                    : null;
                const inboundNodes = host.configProfileInboundUuid
                    ? (nodesByInbound.get(host.configProfileInboundUuid) ?? [])
                          .map((nodeUuid) => nodeNameByUuid.get(nodeUuid))
                          .filter((name): name is string => !!name)
                    : [];
                const hostNodes = (host.nodes ?? [])
                    .map((node) => nodeNameByUuid.get(node.nodeUuid))
                    .filter((name): name is string => !!name);

                const domainRules =
                    (host.domainRules as { mode?: string; domains?: string[] } | null) ?? null;
                const groupLimit = host.tagTrafficLimits?.slice().sort((a, b) => {
                    const leftA = a.limitBytes - a.usedBytes;
                    const leftB = b.limitBytes - b.usedBytes;
                    return leftA < leftB ? -1 : leftA > leftB ? 1 : 0;
                })[0];
                const effectiveLimit = groupLimit?.limitBytes ?? host.userTrafficLimitBytes;
                const effectiveUsed = groupLimit
                    ? groupLimit.ambiguous
                        ? groupLimit.limitBytes
                        : groupLimit.usedBytes
                    : host.ambiguousTraffic && effectiveLimit != null && effectiveLimit > 0n
                      ? effectiveLimit
                      : host.usedBytes;

                return {
                    uuid: host.uuid,
                    remark: host.remark,
                    address: host.address,
                    port: host.port,
                    isDisabled: host.isDisabled,
                    isHidden: host.isHidden,
                    alwaysAvailable: host.alwaysAvailable,
                    userTrafficLimitBytes: effectiveLimit == null ? null : Number(effectiveLimit),
                    usedTrafficBytes: effectiveUsed == null ? null : Number(effectiveUsed),
                    speedLimitMbps: host.speedLimitMbps,
                    domainRules,
                    inbound,
                    profileUuid,
                    nodes: inboundNodes.length > 0 ? inboundNodes : hostNodes,
                };
            });

            const visibleProfileUuids = new Set(hostDtos.map((host) => host.profileUuid));
            const blockedSamples = profileDtos
                .filter((profile) => !user || visibleProfileUuids.has(profile.uuid))
                .flatMap((profile) => {
                    const blockedTags = new Set(
                        profile.outbounds
                            .filter((outbound) => outbound.protocol === 'blackhole')
                            .map((outbound) => outbound.tag),
                    );
                    return profile.routing.rules
                        .filter((rule) => rule.outboundTag && blockedTags.has(rule.outboundTag))
                        .flatMap((rule) => rule.domains ?? []);
                })
                .slice(0, 40);

            const response = {
                user: user
                    ? {
                          shortUuid: user.shortUuid,
                          username: user.username,
                          activeInternalSquadUuids: user.activeInternalSquads.map(
                              (squad) => squad.uuid,
                          ),
                          status: user.status as string,
                          expireAt: user.expireAt ? user.expireAt.toISOString() : null,
                          trafficLimitBytes:
                              user.trafficLimitBytes == null
                                  ? null
                                  : Number(user.trafficLimitBytes),
                          usedTrafficBytes:
                              user.userTraffic == null
                                  ? null
                                  : Number(user.userTraffic.usedTrafficBytes),
                          hwidDeviceLimit: user.hwidDeviceLimit,
                      }
                    : null,
                profiles: profileDtos,
                hosts: hostDtos,
                summary: {
                    hostsTotal: hostDtos.length,
                    hostsAccessible: hostDtos.filter((host) => !host.isDisabled && !host.isHidden)
                        .length,
                    inboundsTotal: profileDtos.reduce(
                        (sum, profile) => sum + profile.inbounds.length,
                        0,
                    ),
                    nodesTotal: nodeRows.length,
                    outboundsTotal: profileDtos.reduce(
                        (sum, profile) => sum + profile.outbounds.length,
                        0,
                    ),
                    routingRulesTotal: profileDtos.reduce(
                        (sum, profile) => sum + profile.routing.rules.length,
                        0,
                    ),
                    blockedDomainsSamples: blockedSamples,
                },
            };

            return ok(response);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

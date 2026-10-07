import { ConflictException } from '@nestjs/common';
export type HostPolicy = {
    uuid: string;
    tags: string[];
    nodes: { nodeUuid: string }[];
    configProfileInboundUuid: string | null;
    alwaysAvailable: boolean;
    onlyWhenInactive: boolean;
    userTrafficLimitBytes: bigint | null;
    serverSpeedLimitMbps: number | null;
    totalSpeedLimitMbps?: number | null;
    useTagTrafficLimit?: boolean;
    useTagSpeedLimit?: boolean;
    useTagTotalSpeedLimit?: boolean;
    domainRules?: unknown;
    managed?: boolean;
};
export function requiresHostPolicy(h: HostPolicy, limits: { tag: string }[]): boolean {
    const domains = h.domainRules as { mode?: string } | null;
    return (
        !!h.managed ||
        h.alwaysAvailable ||
        h.onlyWhenInactive ||
        (h.userTrafficLimitBytes ?? 0n) > 0n ||
        (h.serverSpeedLimitMbps ?? 0) > 0 ||
        (h.totalSpeedLimitMbps ?? 0) > 0 ||
        (!!domains?.mode && domains.mode !== 'OFF') ||
        ((h.useTagTrafficLimit !== false ||
            h.useTagSpeedLimit !== false ||
            h.useTagTotalSpeedLimit !== false) &&
            limits.some((t) => h.tags.includes(t.tag)))
    );
}
export function validateHostPolicies(
    hosts: HostPolicy[],
    limits: { tag: string }[],
    bindings?: { configProfileInboundUuid: string; nodeUuid: string }[],
): void {
    for (const h of hosts) {
        if (h.onlyWhenInactive && !h.alwaysAvailable)
            throw new ConflictException('Сначала включите доступ после окончания подписки');
        if (!requiresHostPolicy(h, limits)) continue;
        if (!h.configProfileInboundUuid)
            throw new ConflictException('Для правил хоста необходимо выбрать inbound');
        if (
            bindings &&
            h.nodes.some(
                (n) =>
                    !bindings.some(
                        (b) =>
                            b.configProfileInboundUuid === h.configProfileInboundUuid &&
                            b.nodeUuid === n.nodeUuid,
                    ),
            )
        )
            throw new ConflictException('Выбранная нода должна использовать inbound хоста');
    }
}

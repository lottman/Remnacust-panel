import { HostWithRawInbound } from '../entities/host-with-inbound-tag.entity';
export function isHostTrafficPaused(host: HostWithRawInbound): boolean {
    return (
        host.trafficPaused ||
        (host.useTagTrafficLimit !== false && host.tagTrafficLimits.some((limit) => limit.paused))
    );
}
export function isHostTrafficLimited(host: HostWithRawInbound): boolean {
    if (isHostTrafficPaused(host)) return true;
    if (
        host.useTagTrafficLimit !== false &&
        host.tagTrafficLimits.some(
            (limit) =>
                limit.ambiguous || (limit.limitBytes > 0n && limit.usedBytes >= limit.limitBytes),
        )
    )
        return true;
    return (
        (host.effectiveLimitBytes ?? host.userTrafficLimitBytes ?? 0n) > 0n &&
        BigInt(host.usedBytes ?? 0) >= (host.effectiveLimitBytes ?? host.userTrafficLimitBytes!)
    );
}

export const UNRESERVED_USAGE = 'remnacust-unreserved-usage-v1';
export const UNRESERVED_PREFIX = 'qfree>>>';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const decimal = /^[1-9][0-9]{0,18}$/;
const maxInt64 = 9223372036854775807n;
export type UnreservedUsageCounter = {
    account: string;
    owner: string;
    factor: bigint;
    scale: bigint;
    direction: 'uplink' | 'downlink';
};
// Internal journal metadata; never a subscriber, hostname or client parameter.
export function parseUnreservedUsageCounter(name: string): UnreservedUsageCounter | null {
    const parts = name.split('>>>');
    if (
        parts.length !== 7 ||
        parts[0] !== 'qfree' ||
        !uuid.test(parts[1]) ||
        !decimal.test(parts[2]) ||
        BigInt(parts[2]) > maxInt64 ||
        !decimal.test(parts[3]) ||
        !decimal.test(parts[4]) ||
        parts[5] !== 'traffic' ||
        (parts[6] !== 'uplink' && parts[6] !== 'downlink')
    )
        return null;
    const factor = BigInt(parts[3]),
        scale = BigInt(parts[4]);
    if ((scale !== 100n && scale !== 1000000000n) || factor > 100n * scale) return null;
    return { account: parts[1], owner: parts[2], factor, scale, direction: parts[6] };
}
export function isUsageCounter(name: string): boolean {
    return name.startsWith(UNRESERVED_PREFIX)
        ? parseUnreservedUsageCounter(name) !== null
        : /^user>>>.+>>>traffic>>>(uplink|downlink)$/.test(name);
}

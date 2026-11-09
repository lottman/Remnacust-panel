export const EXTENDED_CLIENTS_REGEXES = [
    /^(?:PanicVPN|EraVPN|ЭраVPN)\//i,
    /^FlClash ?X\//,
    /^Flowvy\//,
    /^prizrak-box\//,
    /^koala-clash\//,
    /^Happ\//,
    /^INCY\//,
] as const;

export function isExtendedClient(userAgent: string): boolean {
    return EXTENDED_CLIENTS_REGEXES.some((client) => client.test(userAgent));
}

export const JSON_SUBSCRIPTION_FALLBACK_CLIENTS = [
    /^(?:PanicVPN|EraVPN|ЭраVPN)\//i,
    /^v2raytun\/(?:\d+(?:\.\d+)+\b|(?:android|ios|windows|macos|linux)(?:\/|$))/i,
    /^[Ss]treisand/,
    /^Happ\//,
    /^INCY\//,
    /^ktor-client/,
    /^V2Box/,
    /^io\.github\.saeeddev94\.xray\//,
    /^v2rayNG\/(\d+\.\d+\.\d+)/,
    /^v2rayN\/(\d+\.\d+\.\d+)/,
    /^v2plus\/(\d+\.\d+\.\d+)/,
] as const;

export function isThroneJsonSubscriptionSupported(userAgent: string): boolean {
    const match =
        /^Throne\/(\d{1,4})\.(\d{1,4})\.(\d{1,4})(?:-([0-9A-Za-z.-]{1,64}))?(?:[\s/]|$)/i.exec(
            userAgent,
        );
    if (!match) return false;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);
    if (major !== 1) return false;
    if (minor !== 2) return minor > 2;
    if (patch > 0 || !match[4]) return true;
    const beta = /^beta\.(\d{1,4})$/.exec(match[4]);
    return !!beta && Number(beta[1]) >= 5;
}
export function isJsonSubscriptionFallbackSupported(userAgent: string): boolean {
    return (
        isThroneJsonSubscriptionSupported(userAgent) ||
        JSON_SUBSCRIPTION_FALLBACK_CLIENTS.some((client) => client.test(userAgent))
    );
}

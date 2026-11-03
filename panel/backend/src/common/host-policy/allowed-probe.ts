import { isIpDestinationRule, normalizeDestinationRule } from './destination-rule';

type DestinationPolicy = { mode: string; domains: string[] } | null | undefined;

export function allowedProbeUrl(
    policies: DestinationPolicy[],
    preferredUrl?: string,
): string | undefined {
    const normalized: { mode: string; domains: Set<string> }[] = [];
    const canonical = new Map<string, string>();
    for (const policy of policies) {
        if (!policy || policy.mode === 'OFF') continue;
        if (!['ALLOW_ONLY', 'DENY'].includes(policy.mode) || !Array.isArray(policy.domains))
            return undefined;
        try {
            const domains = policy.domains.map((value) => {
                if (!canonical.has(value)) canonical.set(value, normalizeDestinationRule(value));
                return canonical.get(value)!;
            });
            if (policy.mode === 'DENY' && domains.some(isIpDestinationRule)) return undefined;
            normalized.push({
                mode: policy.mode,
                domains: new Set(domains.filter((domain) => !isIpDestinationRule(domain))),
            });
        } catch {
            return undefined;
        }
    }
    const allowed = normalized.filter((policy) => policy.mode === 'ALLOW_ONLY');
    if (!allowed.length) return undefined;

    const matches = (domains: Set<string>, domain: string): boolean => {
        for (;;) {
            if (domains.has(domain)) return true;
            const dot = domain.indexOf('.');
            if (dot < 0) return false;
            domain = domain.slice(dot + 1);
        }
    };
    const permits = (domain: string) =>
        normalized.every((policy) => {
            const found = matches(policy.domains, domain);
            return policy.mode === 'ALLOW_ONLY' ? found : !found;
        });
    if (
        preferredUrl &&
        Array.from(preferredUrl).every(
            (character) => character.charCodeAt(0) > 32 && character.charCodeAt(0) !== 127,
        )
    ) {
        try {
            const url = new URL(preferredUrl);
            if (
                ['http:', 'https:'].includes(url.protocol) &&
                !url.username &&
                !url.password &&
                !url.hash &&
                !isIpDestinationRule(url.hostname) &&
                permits(normalizeDestinationRule(url.hostname))
            )
                return url.href;
        } catch {}
    }
    let common = allowed[0].domains;
    for (const policy of allowed.slice(1)) {
        const next = new Set<string>();
        for (const domain of common) if (matches(policy.domains, domain)) next.add(domain);
        for (const domain of policy.domains) if (matches(common, domain)) next.add(domain);
        if (!next.size) return undefined;
        common = next;
    }
    for (const domain of common) {
        if (permits(domain)) return `https://${domain}/`;
    }
    return undefined;
}

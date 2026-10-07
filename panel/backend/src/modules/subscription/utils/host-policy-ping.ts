// Happ's documented app-management setting requires a real Provider ID.
// TCP measures reachability of the server/CDN; it does not assert VPN authorization.
export function applyHostPolicyPing(
    headers: Record<string, string | undefined>,
    hosts: { domainRules?: unknown }[],
): void {
    const provider = Object.entries(headers).find(([key]) => key.toLowerCase() === 'provider-id');
    if (!provider?.[1]?.trim() || !hosts.some((host) => {
        const rules = host.domainRules as { mode?: string } | null;
        return rules?.mode === 'ALLOW_ONLY' || rules?.mode === 'DENY';
    })) return;
    // Avoid duplicate case-insensitive HTTP fields from custom response headers.
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'ping-type') delete headers[key];
    }
    headers['ping-type'] = 'tcp';
}

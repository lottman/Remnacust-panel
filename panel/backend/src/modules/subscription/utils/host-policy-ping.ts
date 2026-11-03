import { allowedProbeUrl } from '../../../common/host-policy/allowed-probe';

export function applyHostPolicyPing(
    headers: Record<string, string | undefined>,
    hosts: { domainRules?: unknown; isHidden?: boolean; isDisabled?: boolean }[],
): void {
    const visible = hosts.filter((host) => !host.isHidden && !host.isDisabled);
    const provider = Object.entries(headers).find(([key]) => key.toLowerCase() === 'provider-id');
    if (
        !provider?.[1]?.trim() ||
        !visible.some((host) => {
            const rules = host.domainRules as { mode?: string } | null;
            return rules?.mode === 'ALLOW_ONLY' || rules?.mode === 'DENY';
        })
    )
        return;
    const currentUrl = Object.entries(headers)
        .reverse()
        .find(([key]) => key.toLowerCase() === 'check-url-via-proxy')?.[1];
    const currentType = Object.entries(headers)
        .reverse()
        .find(([key]) => key.toLowerCase() === 'ping-type')?.[1];
    if (currentType === 'tcp' || currentType === 'icmp') return;
    const url = allowedProbeUrl(
        visible.map((host) => host.domainRules as Parameters<typeof allowedProbeUrl>[0][number]),
        currentUrl,
    );
    for (const key of Object.keys(headers)) {
        if (['ping-type', 'check-url-via-proxy'].includes(key.toLowerCase())) delete headers[key];
    }
    headers['ping-type'] = url ? (currentType === 'proxy' ? 'proxy' : 'proxy-head') : 'tcp';
    if (url) headers['check-url-via-proxy'] = url;
}

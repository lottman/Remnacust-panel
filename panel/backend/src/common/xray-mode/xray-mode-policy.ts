export type XrayMode = 'custom' | 'default';

export const CUSTOM_CORE_FEATURES = [
    'host-limits',
    'device-speed-limits',
    'destination-rules',
    'inactive-host-access',
    'autoselect-quota-owner',
    'live-port-plans',
    'xera-http',
] as const;

export function withCoreFlavor<T extends Record<string, unknown>>(config: T, mode: XrayMode, depth = 0): T {
    if (depth > 16) throw new Error('Profile graph nesting limit exceeded');
    const value = config.geodata;
    const geodata = { ...(value && typeof value === 'object' && !Array.isArray(value) ? value : {}) } as Record<string, unknown>;
    delete geodata.core;
    geodata.remnacustCoreFlavor = mode;
    const result = { ...config, geodata };
    const plan = config.remnacustProfileGraphs;
    if (plan && typeof plan === 'object' && !Array.isArray(plan)) {
        const graphs = (plan as Record<string, unknown>).graphs;
        if (Array.isArray(graphs)) {
            Object.assign(result, { remnacustProfileGraphs: { ...plan, graphs: graphs.map(graph => {
                if (!graph || typeof graph !== 'object' || !graph.config || typeof graph.config !== 'object' || Array.isArray(graph.config)) return graph;
                return { ...graph, config: withCoreFlavor(graph.config, mode, depth + 1) };
            }) } });
        }
    }
    return result;
}

export function customCoreConfigPaths(config: unknown): string[] {
    const paths: string[] = [];
    const pending: { value: unknown; path: string; depth: number }[] = [{ value: config, path: '', depth: 0 }];
    const seen = new WeakSet<object>();
    let visited = 0;
    while (pending.length) {
        const { value, path, depth } = pending.pop()!;
        if (!value || typeof value !== 'object') continue;
        if (seen.has(value)) continue;
        seen.add(value);
        for (const [key, child] of Object.entries(value)) {
            if (++visited > 200_000 || depth > 64 || path.length + key.length > 4096)
                return ['configuration-complexity-limit'];
            const current = path ? `${path}.${key}` : key;
            if (
                ((key === 'network' || key === 'method') && ['xera-http', 'xera'].includes(String(child))) ||
                (key === 'protocol' && child === 'olcrtc') ||
                (key === 'remnacustUserQuotaRequired' && child === true) ||
                (key === 'webhook' && /^routing\.rules\.\d+(?:\.|$)/.test(path)) ||
                key === 'xeraHttpSettings' || key === 'remnacustProfileGraphs' ||
                key === 'hostPolicy' || key === 'xeraHostPolicy'
            ) paths.push(current);
            if (child && typeof child === 'object') pending.push({ value: child, path: current, depth: depth + 1 });
        }
        if (paths.length >= 50) break;
    }
    return paths.sort();
}

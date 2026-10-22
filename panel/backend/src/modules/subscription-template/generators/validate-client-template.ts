import { InjectHostsEntrySchema } from '@libs/contracts/models';

export function validateClientTemplate(config: unknown, type: string): void {
    if (!config || typeof config !== 'object' || Array.isArray(config))
        throw new Error('template-object');
    const root = config as Record<string, unknown>;
    const key = type === 'SINGBOX' ? 'outbounds' : 'proxy-groups';
    if (root[key] === undefined) return;
    if (!Array.isArray(root[key])) throw new Error('groups-array');
    if (root[key].length > 1000) throw new Error('groups-limit');
    const names = new Set<string>();
    for (const item of root[key]) {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            throw new Error('group-object');
        const group = item as Record<string, unknown>;
        const custom = group.remnawave as Record<string, unknown> | undefined;
        if (custom?.pool === undefined) continue;
        const name = group[type === 'SINGBOX' ? 'tag' : 'name'];
        if (
            typeof name !== 'string' ||
            !name.trim() ||
            name.length > 255 ||
            /[,\r\n\0]/.test(name) ||
            names.has(name)
        )
            throw new Error('group-name');
        names.add(name);
        const pool = InjectHostsEntrySchema.parse(custom.pool);
        if (pool.selector.type === 'sameTagAsRecipient') throw new Error('group-recipient');
        if (pool?.selector.type === 'tagRegex' || pool?.selector.type === 'remarkRegex')
            new RegExp(pool.selector.pattern);
        const allowed =
            type === 'SINGBOX'
                ? ['selector', 'urltest']
                : ['select', 'url-test', 'fallback', 'load-balance'];
        if (!allowed.includes(String(group.type))) throw new Error('group-type');
    }
}

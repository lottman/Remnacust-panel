import type { DatRules } from './compile-dat';
import type { StoredGeofile } from './geofiles.service';

import {
    datClientFile,
    DEFAULT_GEOFILE_INTERVAL,
    geofileInterval,
    nativePayload,
} from './geofile-delivery';

export interface GeofileReference {
    id: string;
    categories?: string[];
    target: string;
    downloadToClient?: boolean;
    clientRefreshIntervalSeconds?: number;
}
type ObjectValue = Record<string, any>;

export function geofileReferences(config: ObjectValue): GeofileReference[] {
    const references = config.remnacust?.geofiles;
    if (references === undefined) return [];
    if (!Array.isArray(references) || references.length > 32) throw new Error('geofile-references');
    for (const reference of references) {
        if (
            !reference ||
            typeof reference !== 'object' ||
            !/^[a-f0-9]{34}$/.test(reference.id) ||
            (reference.downloadToClient !== false &&
                (typeof reference.target !== 'string' ||
                    !reference.target.trim() ||
                    reference.target.length > 255 ||
                    /[,\r\n\0]/.test(reference.target))) ||
            (reference.downloadToClient !== undefined &&
                typeof reference.downloadToClient !== 'boolean')
        )
            throw new Error('geofile-reference');
        if (reference.clientRefreshIntervalSeconds !== undefined)
            geofileInterval(reference.clientRefreshIntervalSeconds);
    }
    return references.map((reference) =>
        reference.downloadToClient === false ? { ...reference, target: 'DIRECT' } : reference,
    );
}

export async function materializeGeofiles(
    config: ObjectValue,
    type: string,
    fileById: (id: string) => Promise<StoredGeofile>,
    dat: (file: StoredGeofile, categories: string[]) => Promise<DatRules>,
    resources?: {
        read: (file: StoredGeofile) => Promise<Buffer>;
        datUrl: (file: StoredGeofile, categories: string[], format: string) => string;
    },
): Promise<ObjectValue> {
    const references = geofileReferences(config);
    const root = structuredClone(config);
    delete root.remnacust;
    if (!references.length) return root;
    const generated: ObjectValue[] = [],
        yamlRules: string[] = [];
    let inlineRecords = 0,
        inlineBytes = 0;
    const sing = type === 'SINGBOX',
        xray = type === 'XRAY_JSON';
    for (const reference of references) {
        const file = await fileById(reference.id);
        if (
            reference.downloadToClient === false &&
            !['geoip', 'geosite'].includes(file.kind) &&
            !resources
        )
            throw new Error('geofile-resources');
        const tag = `geo_${file.id}`;
        let target = reference.downloadToClient === false ? 'DIRECT' : reference.target;
        const interval = reference.clientRefreshIntervalSeconds ?? DEFAULT_GEOFILE_INTERVAL;
        let route: ObjectValue;
        if (xray) {
            if (target === 'DIRECT' || target === 'REJECT') {
                const protocol = target === 'DIRECT' ? 'freedom' : 'blackhole';
                target = `geo-${protocol}`;
                root.outbounds ??= [];
                const existing = root.outbounds.find((item: ObjectValue) => item.tag === target);
                if (existing && existing.protocol !== protocol)
                    throw new Error('geofile-target-collision');
                if (!existing) root.outbounds.push({ tag: target, protocol });
            }
            const balancer = root.routing?.balancers?.some(
                (item: ObjectValue) => item.tag === target,
            );
            const dynamic = root.remnawave?.injectHosts?.some(
                (pool: ObjectValue) => pool.tagPrefix === target,
            );
            const standardProxy =
                target === 'proxy' &&
                (!root.remnawave?.injectHosts || root.remnawave?.addVirtualHostAsOutbound);
            if (
                !balancer &&
                !dynamic &&
                !standardProxy &&
                !root.outbounds?.some((item: ObjectValue) => item.tag === target)
            )
                throw new Error('geofile-target');
            route = {
                type: 'field',
                ...(balancer ? { balancerTag: target } : { outboundTag: target }),
            };
        } else if (sing) {
            if (target === 'REJECT') route = { action: 'reject' };
            else {
                if (target === 'DIRECT') {
                    target = 'geo-direct';
                    root.outbounds ??= [];
                    const existing = root.outbounds.find(
                        (item: ObjectValue) => item.tag === target,
                    );
                    if (existing && existing.type !== 'direct')
                        throw new Error('geofile-target-collision');
                    if (!existing) root.outbounds.push({ type: 'direct', tag: target });
                }
                route = { action: 'route', outbound: target };
                if (!root.outbounds?.some((item: ObjectValue) => item.tag === target))
                    throw new Error('geofile-target');
            }
        } else {
            if (
                !['DIRECT', 'REJECT'].includes(target) &&
                !root['proxy-groups']?.some((group: ObjectValue) => group.name === target) &&
                !root.proxies?.some((proxy: ObjectValue) => proxy.name === target)
            )
                throw new Error('geofile-target');
            route = {};
        }
        if (
            (file.kind === 'geoip' || file.kind === 'geosite') &&
            reference.downloadToClient === true
        ) {
            if (xray) throw new Error('geofile-xray-bootstrap-unsupported');
            if (!resources) throw new Error('geofile-resources');
            // Validate selected categories before returning a remotely loaded provider.
            datClientFile(await dat(file, reference.categories ?? []), type);
            const url = resources.datUrl(file, reference.categories ?? [], type);
            if (sing) {
                root.route ??= {};
                root.route.rule_set ??= [];
                if (root.route.rule_set.some((item: ObjectValue) => item.tag === tag))
                    throw new Error('geofile-name-collision');
                root.route.rule_set.push({
                    type: 'remote',
                    tag,
                    format: 'source',
                    url,
                    update_interval: `${interval}s`,
                });
                root.experimental ??= {};
                root.experimental.cache_file ??= {};
                root.experimental.cache_file.enabled = true;
                generated.push({ ...route, rule_set: [tag] });
            } else {
                root['rule-providers'] ??= {};
                if (root['rule-providers'][tag]) throw new Error('geofile-name-collision');
                root['rule-providers'][tag] = {
                    type: 'http',
                    behavior: 'classical',
                    url,
                    path: `./rulesets/${tag}.yaml`,
                    interval,
                };
                yamlRules.push(`RULE-SET,${tag},${target}`);
            }
        } else if (file.kind === 'geoip' || file.kind === 'geosite') {
            const rules = await dat(file, reference.categories ?? []);
            inlineRecords += rules.ips.length + rules.domains.length;
            inlineBytes +=
                rules.ips.reduce((sum, value) => sum + value.length, 0) +
                rules.domains.reduce((sum, item) => sum + Buffer.byteLength(item.value), 0);
            if (inlineRecords > 100_000 || inlineBytes > 4 * 1024 * 1024)
                throw new Error('geofile-inline-limit');
            if (xray) {
                generated.push({
                    ...route,
                    ...(file.kind === 'geoip'
                        ? { ip: rules.ips }
                        : {
                              domain: rules.domains.map(
                                  (item) =>
                                      ['', 'regexp:', 'domain:', 'full:'][item.type] + item.value,
                              ),
                          }),
                });
            } else if (sing) {
                if (rules.ips.length) generated.push({ ...route, ip_cidr: rules.ips });
                for (const [index, key] of [
                    'domain_keyword',
                    'domain_regex',
                    'domain_suffix',
                    'domain',
                ].entries()) {
                    const values = rules.domains
                        .filter((item) => item.type === index)
                        .map((item) => item.value);
                    if (values.length) generated.push({ ...route, [key]: values });
                }
            } else {
                for (const ip of rules.ips)
                    yamlRules.push(
                        `${ip.includes(':') ? 'IP-CIDR6' : 'IP-CIDR'},${ip},${target},no-resolve`,
                    );
                for (const domain of rules.domains) {
                    if (domain.type === 1 && type !== 'MIHOMO')
                        throw new Error('geofile-regex-client');
                    if (domain.value.includes(',')) throw new Error('geofile-domain-client');
                    yamlRules.push(
                        `${['DOMAIN-KEYWORD', 'DOMAIN-REGEX', 'DOMAIN-SUFFIX', 'DOMAIN'][domain.type]},${domain.value},${target}`,
                    );
                }
            }
        } else if (sing && (file.kind === 'singbox-json' || file.kind === 'singbox-srs')) {
            root.route ??= {};
            root.route.rule_set ??= [];
            const existing = root.route.rule_set.find((item: ObjectValue) => item.tag === tag);
            if (existing && existing.url !== file.url) throw new Error('geofile-name-collision');
            if (!existing)
                root.route.rule_set.push({
                    type: reference.downloadToClient === false ? 'inline' : 'remote',
                    tag,
                    ...(reference.downloadToClient === false
                        ? { rules: nativePayload(await resources!.read(file), file.kind) }
                        : {
                              format: file.kind === 'singbox-srs' ? 'binary' : 'source',
                              url: file.url,
                              update_interval: `${interval}s`,
                          }),
                });
            root.experimental ??= {};
            root.experimental.cache_file ??= {};
            root.experimental.cache_file.enabled = true;
            generated.push({ ...route, rule_set: [tag] });
        } else if (!sing && !xray && file.kind.startsWith('mihomo-')) {
            const text = file.kind.startsWith('mihomo-text-');
            if (text && type !== 'MIHOMO') throw new Error('geofile-format-client');
            root['rule-providers'] ??= {};
            const existing = root['rule-providers'][tag];
            if (existing && existing.url !== file.url) throw new Error('geofile-name-collision');
            if (!existing)
                root['rule-providers'][tag] = {
                    type: reference.downloadToClient === false ? 'inline' : 'http',
                    behavior: file.kind.split('-').at(-1),
                    ...(reference.downloadToClient === false
                        ? { payload: nativePayload(await resources!.read(file), file.kind) }
                        : {
                              ...(text ? { format: 'text' } : {}),
                              url: file.url,
                              path: `./rulesets/${tag}.${text ? 'txt' : 'yaml'}`,
                              interval,
                          }),
                };
            yamlRules.push(`RULE-SET,${tag},${target}`);
        } else throw new Error('geofile-format-client');
    }
    if (xray || sing) {
        const key = xray ? 'routing' : 'route';
        root[key] ??= {};
        const rules: ObjectValue[] = root[key].rules ?? [];
        const at = rules.findIndex(
            (rule) =>
                Object.keys(rule).every((field) =>
                    [
                        'type',
                        'action',
                        'outbound',
                        'outboundTag',
                        'balancerTag',
                        'network',
                    ].includes(field),
                ) &&
                (!rule.network || rule.network === 'tcp,udp'),
        );
        root[key].rules = [
            ...rules.slice(0, at < 0 ? rules.length : at),
            ...generated,
            ...rules.slice(at < 0 ? rules.length : at),
        ];
    } else {
        const rules: string[] = root.rules ?? [];
        const at = rules.findIndex((rule) => /^(MATCH|FINAL),/i.test(rule.trim()));
        root.rules = [
            ...rules.slice(0, at < 0 ? rules.length : at),
            ...yamlRules,
            ...rules.slice(at < 0 ? rules.length : at),
        ];
    }
    if (Buffer.byteLength(JSON.stringify(root)) > 8 * 1024 * 1024)
        throw new Error('geofile-config-size');
    return root;
}

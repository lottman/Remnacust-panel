import type { DatRules } from './compile-dat';

import { dump, load } from 'js-yaml';

export const DEFAULT_GEOFILE_INTERVAL = 86400;
export const MAX_GEOFILE_INTERVAL = 30 * 86400;

export function geofileInterval(value: unknown, minimum = 300): number {
    if (
        !Number.isSafeInteger(value) ||
        Number(value) < minimum ||
        Number(value) > MAX_GEOFILE_INTERVAL
    )
        throw new Error('geofile-interval');
    return Number(value);
}

export function singboxDatRules(rules: DatRules): Record<string, unknown>[] {
    const result: Record<string, unknown>[] = [];
    if (rules.ips.length) result.push({ ip_cidr: rules.ips });
    for (const [index, key] of [
        'domain_keyword',
        'domain_regex',
        'domain_suffix',
        'domain',
    ].entries()) {
        const values = rules.domains
            .filter((item) => item.type === index)
            .map((item) => item.value);
        if (values.length) result.push({ [key]: values });
    }
    return result;
}

export function yamlDatRules(rules: DatRules, format: string): string[] {
    return [
        ...rules.ips.map((ip) => `${ip.includes(':') ? 'IP-CIDR6' : 'IP-CIDR'},${ip},no-resolve`),
        ...rules.domains.map((domain) => {
            if ((domain.type === 1 && format !== 'MIHOMO') || domain.value.includes(','))
                throw new Error('geofile-regex-client');
            return `${['DOMAIN-KEYWORD', 'DOMAIN-REGEX', 'DOMAIN-SUFFIX', 'DOMAIN'][domain.type]},${domain.value}`;
        }),
    ];
}

export function datClientFile(rules: DatRules, format: string): Buffer {
    const content =
        format === 'SINGBOX'
            ? JSON.stringify({ version: 3, rules: singboxDatRules(rules) })
            : dump({ payload: yamlDatRules(rules, format) }, { noRefs: true });
    if (Buffer.byteLength(content) > 8 * 1024 * 1024) throw new Error('geofile-config-size');
    return Buffer.from(content);
}

export function nativePayload(data: Buffer, kind: string): unknown[] {
    if (kind === 'singbox-json') return JSON.parse(data.toString('utf8')).rules;
    if (kind === 'singbox-srs') throw new Error('geofile-srs-requires-download');
    return kind.startsWith('mihomo-text-')
        ? data
              .toString('utf8')
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter((line) => line.trim() && !line.trimStart().startsWith('#'))
        : (
              load(data.toString('utf8'), { maxAliases: 0, maxTotalMergeKeys: 0 }) as {
                  payload: unknown[];
              }
          ).payload;
}

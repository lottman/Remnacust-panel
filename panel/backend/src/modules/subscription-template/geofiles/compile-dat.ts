import { Address6 } from 'ip-address';

import { geofileFields } from './validate-geofile';

export interface DatRules {
    ips: string[];
    domains: { type: number; value: string }[];
}
export function datCategories(data: Buffer): string[] {
    const codes: string[] = [];
    for (const entry of geofileFields(data)) {
        if (!Buffer.isBuffer(entry.value)) continue;
        for (const field of geofileFields(entry.value))
            if (field.field === 1 && Buffer.isBuffer(field.value))
                codes.push(field.value.toString('utf8').toLowerCase());
    }
    return [...new Set(codes)].sort();
}

export function compileDat(
    data: Buffer,
    kind: 'geoip' | 'geosite',
    categories: string[],
    validateOnly = false,
): DatRules {
    if (
        !Array.isArray(categories) ||
        !categories.length ||
        categories.length > 32 ||
        categories.some(
            (code) =>
                typeof code !== 'string' ||
                !/^[a-zA-Z0-9_.!+-]+(?:@[a-zA-Z0-9_.!+-]+)?$/.test(code),
        )
    )
        throw new Error('geofile-categories');
    const wanted = new Set(categories.map((code) => code.toLowerCase()));
    const seen = new Set<string>();
    const matchers = new Set<string>();
    const result: DatRules = { ips: [], domains: [] };
    let bytes = 0;
    let matched = false;
    for (const entry of geofileFields(data)) {
        if (!Buffer.isBuffer(entry.value)) continue;
        let code: number | Buffer | undefined;
        let reverse = false;
        for (const field of geofileFields(entry.value)) {
            if (field.field === 1) code = field.value;
            if (field.field === 3 && field.value !== 0) reverse = true;
        }
        if (!Buffer.isBuffer(code)) continue;
        const requests = [...wanted].filter(
            (value) => value.split('@')[0] === code.toString('utf8').toLowerCase(),
        );
        if (!requests.length) continue;
        requests.forEach((value) => seen.add(value));
        if (kind === 'geoip' && reverse) throw new Error('geofile-reverse-cidr');
        for (const record of geofileFields(entry.value)) {
            if (record.field !== 2) continue;
            if (!Buffer.isBuffer(record.value)) continue;
            const parts = [...geofileFields(record.value)];
            if (kind === 'geoip') {
                if (requests.some((value) => value.includes('@')))
                    throw new Error('geofile-categories');
                const ip = parts.find((field) => field.field === 1)?.value;
                const prefix = parts.find((field) => field.field === 2)?.value ?? 0;
                if (!Buffer.isBuffer(ip)) throw new Error('geofile-dat');
                const address =
                    ip.length === 4
                        ? [...ip].join('.')
                        : Address6.fromByteArray([...ip]).correctForm();
                const value = `${address}/${prefix}`;
                matched = true;
                if (validateOnly) continue;
                if (matchers.has(value)) continue;
                matchers.add(value);
                result.ips.push(value);
                bytes += value.length;
            } else {
                const attributes = parts
                    .filter((field) => field.field === 3)
                    .flatMap((field) => {
                        if (!Buffer.isBuffer(field.value)) return [];
                        return [...geofileFields(field.value)]
                            .filter(
                                (attribute) =>
                                    attribute.field === 1 && Buffer.isBuffer(attribute.value),
                            )
                            .map((attribute) =>
                                (attribute.value as Buffer).toString('utf8').toLowerCase(),
                            );
                    });
                if (
                    !requests.some(
                        (value) => !value.includes('@') || attributes.includes(value.split('@')[1]),
                    )
                )
                    continue;
                const value = parts.find((field) => field.field === 2)?.value;
                if (!Buffer.isBuffer(value)) throw new Error('geofile-dat');
                const domain = value.toString('utf8');
                const type = Number(parts.find((field) => field.field === 1)?.value ?? 0);
                matched = true;
                if (validateOnly) continue;
                // Categories form a union in one route; identical matchers add no coverage.
                const key = `${type}:${domain}`;
                if (matchers.has(key)) continue;
                matchers.add(key);
                result.domains.push({
                    type,
                    value: domain,
                });
                bytes += value.length;
            }
            if (result.ips.length + result.domains.length > 50_000 || bytes > 2 * 1024 * 1024)
                throw new Error('geofile-inline-limit');
        }
    }
    if ([...wanted].some((value) => !seen.has(value)) || !matched)
        throw new Error('geofile-category-empty');
    return result;
}

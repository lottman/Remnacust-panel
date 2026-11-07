import { load } from 'js-yaml';

import { MAX_GEOFILE_BYTES } from './download-geofile';
import { createGoRegexpValidator } from './go-regexp';
import { validateSrs } from './validate-srs';

export const GEOFILE_KINDS = [
    'geoip',
    'geosite',
    'singbox-json',
    'singbox-srs',
    'mihomo-domain',
    'mihomo-ipcidr',
    'mihomo-classical',
    'mihomo-text-domain',
    'mihomo-text-ipcidr',
] as const;
export type GeofileKind = (typeof GEOFILE_KINDS)[number];
export const GEOFILE_EXTENSIONS: Record<GeofileKind, string> = {
    geoip: 'dat',
    geosite: 'dat',
    'singbox-json': 'json',
    'singbox-srs': 'srs',
    'mihomo-domain': 'yaml',
    'mihomo-ipcidr': 'yaml',
    'mihomo-classical': 'yaml',
    'mihomo-text-domain': 'txt',
    'mihomo-text-ipcidr': 'txt',
};

function varint(data: Buffer, cursor: { offset: number }): number {
    let value = 0n;
    for (let i = 0; i < 10 && cursor.offset < data.length; i++) {
        const byte = data[cursor.offset++];
        if (i === 9 && byte > 1) throw new Error('geofile-protobuf');
        value |= BigInt(byte & 127) << BigInt(i * 7);
        if (!(byte & 128)) return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : NaN;
    }
    throw new Error('geofile-protobuf');
}

export function* geofileFields(
    data: Buffer,
    spans = false,
    includeFixed = false,
): Generator<{
    field: number;
    value: number | Buffer;
    start?: number;
    end?: number;
    wire?: number;
}> {
    const cursor = { offset: 0 };
    let count = 0;
    while (cursor.offset < data.length) {
        const start = cursor.offset;
        if (++count > 1_000_000) throw new Error('geofile-complexity');
        const tag = varint(data, cursor),
            field = Math.floor(tag / 8),
            wire = tag % 8;
        if (!Number.isSafeInteger(tag) || field < 1 || field > 536870911)
            throw new Error('geofile-protobuf');
        if (wire === 0) {
            const value = varint(data, cursor);
            yield {
                field,
                value,
                ...(spans ? { start, end: cursor.offset } : {}),
                ...(includeFixed ? { wire } : {}),
            };
        } else if (wire === 2) {
            const length = varint(data, cursor);
            if (!Number.isSafeInteger(length) || length < 0 || cursor.offset + length > data.length)
                throw new Error('geofile-protobuf');
            const value = data.subarray(cursor.offset, cursor.offset + length);
            cursor.offset += length;
            yield {
                field,
                value,
                ...(spans ? { start, end: cursor.offset } : {}),
                ...(includeFixed ? { wire } : {}),
            };
        } else if (wire === 1 || wire === 5) {
            const offset = cursor.offset;
            cursor.offset += wire === 1 ? 8 : 4;
            if (cursor.offset > data.length) throw new Error('geofile-protobuf');
            if (includeFixed)
                yield {
                    field,
                    value: data.subarray(offset, cursor.offset),
                    wire,
                    ...(spans ? { start, end: cursor.offset } : {}),
                };
        } else throw new Error('geofile-protobuf');
    }
}

const fields = geofileFields;

const utf8 = (value: Buffer) => new TextDecoder('utf-8', { fatal: true }).decode(value);

export function* validateDatSteps(data: Buffer, kind: 'geoip' | 'geosite'): Generator<void, void> {
    if (!data.length || data.length > MAX_GEOFILE_BYTES) throw Error('geofile-size-or-kind');
    const regexp = createGoRegexpValidator();
    let entries = 0,
        records = 0,
        work = 0;
    for (const entry of fields(data, false, true)) {
        if (++work % 1000 === 0) yield;
        if (entry.field !== 1) continue;
        if (entry.wire !== 2 || !Buffer.isBuffer(entry.value) || !entry.value.length)
            throw Error('geofile-dat');
        if (++entries > 50_000) throw new Error('geofile-complexity');
        let code = false,
            items = 0,
            reverse = false;
        for (const item of fields(entry.value, false, true)) {
            if (++work % 1000 === 0) yield;
            if (item.field === 1) {
                if (code) throw Error('geofile-duplicate-field');
                if (
                    item.wire !== 2 ||
                    !Buffer.isBuffer(item.value) ||
                    !/^[A-Za-z0-9_@.\-!+]{1,128}$/.test(utf8(item.value))
                )
                    throw new Error('geofile-dat');
                code = true;
            }
            if (kind === 'geoip' && item.field === 3) {
                if (reverse) throw Error('geofile-duplicate-field');
                if (item.wire !== 0 || typeof item.value !== 'number') throw Error('geofile-dat');
                reverse = true;
            }
            if (item.field !== 2) continue;
            if (item.wire !== 2 || !Buffer.isBuffer(item.value) || ++records > 2_000_000)
                throw new Error('geofile-dat');
            items++;
            let first: Buffer | number | undefined, second: Buffer | number | undefined;
            let haveFirst = false,
                haveSecond = false;
            for (const part of fields(item.value, false, true)) {
                if (++work % 1000 === 0) yield;
                if (part.field === 1) {
                    if (part.wire !== (kind === 'geoip' ? 2 : 0)) throw Error('geofile-dat');
                    if (haveFirst) throw Error('geofile-duplicate-field');
                    haveFirst = true;
                    first = part.value;
                }
                if (part.field === 2) {
                    if (part.wire !== (kind === 'geoip' ? 0 : 2)) throw Error('geofile-dat');
                    if (haveSecond) throw Error('geofile-duplicate-field');
                    haveSecond = true;
                    second = part.value;
                }
                if (kind === 'geosite' && part.field === 3) {
                    if (part.wire !== 2 || !Buffer.isBuffer(part.value)) throw Error('geofile-dat');
                    let key = false,
                        typedValue = false;
                    for (const attribute of fields(part.value, false, true)) {
                        if (++work % 1000 === 0) yield;
                        if (attribute.field === 1) {
                            if (key) throw Error('geofile-duplicate-field');
                            if (attribute.wire !== 2 || !Buffer.isBuffer(attribute.value))
                                throw Error('geofile-dat');
                            utf8(attribute.value);
                            key = true;
                        }
                        if (attribute.field === 2 || attribute.field === 3) {
                            if (typedValue) throw Error('geofile-duplicate-field');
                            if (attribute.wire !== 0 || typeof attribute.value !== 'number')
                                throw Error('geofile-dat');
                            typedValue = true;
                        }
                    }
                }
            }
            if (kind === 'geoip') {
                const ip = first;
                const prefix = second ?? 0;
                if (
                    !Buffer.isBuffer(ip) ||
                    ![4, 16].includes(ip.length) ||
                    typeof prefix !== 'number' ||
                    !Number.isInteger(prefix) ||
                    prefix < 0 ||
                    prefix > ip.length * 8
                )
                    throw new Error('geofile-dat');
            } else {
                const type = first ?? 0;
                const domain = second;
                if (
                    typeof type !== 'number' ||
                    ![0, 1, 2, 3].includes(type) ||
                    !Buffer.isBuffer(domain) ||
                    domain.length < 1 ||
                    domain.length > 4096 ||
                    // eslint-disable-next-line no-control-regex -- Reject control bytes in uploaded records.
                    /[\x00-\x1f]/.test(utf8(domain))
                )
                    throw new Error('geofile-dat');
                if (type === 1) regexp(utf8(domain));
            }
        }
        if (!code || !items) throw new Error('geofile-dat');
    }
    if (!entries || !records) throw new Error('geofile-dat');
}

export function validateGeofile(data: Buffer, kind: GeofileKind): void {
    if (!GEOFILE_KINDS.includes(kind) || !data.length || data.length > MAX_GEOFILE_BYTES)
        throw new Error('geofile-size-or-kind');
    if (kind === 'geoip' || kind === 'geosite') {
        for (const _ of validateDatSteps(data, kind)) {
            /* Synchronous ingest shares the cooperative editor validator. */
        }
        return;
    }
    if (kind === 'singbox-srs') return validateSrs(data);
    if (data.length > 8 * 1024 * 1024) throw new Error('geofile-text-size');
    const text = utf8(data);
    // eslint-disable-next-line no-control-regex -- Reject control bytes while allowing text whitespace.
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) || /^\s*</.test(text))
        throw new Error('geofile-content');
    if (kind === 'singbox-json') {
        const value = JSON.parse(text);
        const regexp = createGoRegexpValidator();
        if (
            !value ||
            ![1, 2, 3, 4].includes(value.version) ||
            !Array.isArray(value.rules) ||
            !value.rules.length ||
            value.rules.length > 100_000
        )
            throw new Error('geofile-json');
        const walk = (node: unknown, depth: number) => {
            if (depth > 16) throw new Error('geofile-complexity');
            if (node && typeof node === 'object')
                for (const [key, child] of Object.entries(node)) {
                    if (['__proto__', 'constructor', 'prototype'].includes(key))
                        throw new Error('geofile-content');
                    if (key === 'domain_regex') {
                        const patterns = Array.isArray(child) ? child : [child];
                        for (const pattern of patterns) {
                            if (typeof pattern !== 'string') throw Error('geofile-regexp');
                            regexp(pattern);
                        }
                    }
                    walk(child, depth + 1);
                }
        };
        walk(value.rules, 0);
        return;
    }
    const rows = kind.startsWith('mihomo-text-')
        ? text.split(/\r?\n/).filter((line) => line.trim() && !line.trimStart().startsWith('#'))
        : (load(text, { maxAliases: 0, maxTotalMergeKeys: 0 }) as { payload?: unknown })?.payload;
    if (
        !Array.isArray(rows) ||
        !rows.length ||
        rows.length > 500_000 ||
        rows.some((row) => typeof row !== 'string' || row.length > 4096 || /[\r\n\0<>]/.test(row))
    )
        throw new Error('geofile-payload');
    if (kind === 'mihomo-classical') {
        const regexp = createGoRegexpValidator();
        for (const row of rows as string[])
            if (row.startsWith('DOMAIN-REGEX,')) regexp(row.slice('DOMAIN-REGEX,'.length));
    }
}

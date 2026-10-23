import { load } from 'js-yaml';

import { MAX_GEOFILE_BYTES } from './download-geofile';
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
): Generator<{ field: number; value: number | Buffer; start?: number; end?: number }> {
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
            yield { field, value, ...(spans ? { start, end: cursor.offset } : {}) };
        } else if (wire === 2) {
            const length = varint(data, cursor);
            if (!Number.isSafeInteger(length) || length < 0 || cursor.offset + length > data.length)
                throw new Error('geofile-protobuf');
            const value = data.subarray(cursor.offset, cursor.offset + length);
            cursor.offset += length;
            yield { field, value, ...(spans ? { start, end: cursor.offset } : {}) };
        } else if (wire === 1 || wire === 5) {
            cursor.offset += wire === 1 ? 8 : 4;
            if (cursor.offset > data.length) throw new Error('geofile-protobuf');
        } else throw new Error('geofile-protobuf');
    }
}

const fields = geofileFields;

const utf8 = (value: Buffer) => new TextDecoder('utf-8', { fatal: true }).decode(value);

function validateDat(data: Buffer, kind: 'geoip' | 'geosite') {
    let entries = 0,
        records = 0;
    for (const entry of fields(data)) {
        if (entry.field !== 1 || !Buffer.isBuffer(entry.value) || !entry.value.length)
            throw new Error('geofile-dat');
        if (++entries > 50_000) throw new Error('geofile-complexity');
        let code = false,
            items = 0;
        for (const item of fields(entry.value)) {
            if (item.field === 1) {
                if (
                    !Buffer.isBuffer(item.value) ||
                    !/^[A-Za-z0-9_@.\-!+]{1,128}$/.test(utf8(item.value))
                )
                    throw new Error('geofile-dat');
                code = true;
            }
            if (item.field !== 2) continue;
            if (!Buffer.isBuffer(item.value) || ++records > 2_000_000)
                throw new Error('geofile-dat');
            items++;
            const parts = [...fields(item.value)];
            if (kind === 'geoip') {
                const ip = parts.find((part) => part.field === 1)?.value;
                const prefix = parts.find((part) => part.field === 2)?.value ?? 0;
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
                const type = parts.find((part) => part.field === 1)?.value ?? 0;
                const domain = parts.find((part) => part.field === 2)?.value;
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
            }
        }
        if (!code || !items) throw new Error('geofile-dat');
    }
    if (!entries || !records) throw new Error('geofile-dat');
}

export function validateGeofile(data: Buffer, kind: GeofileKind): void {
    if (!GEOFILE_KINDS.includes(kind) || !data.length || data.length > MAX_GEOFILE_BYTES)
        throw new Error('geofile-size-or-kind');
    if (kind === 'geoip' || kind === 'geosite') return validateDat(data, kind);
    if (kind === 'singbox-srs') return validateSrs(data);
    if (data.length > 8 * 1024 * 1024) throw new Error('geofile-text-size');
    const text = utf8(data);
    // eslint-disable-next-line no-control-regex -- Reject control bytes while allowing text whitespace.
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) || /^\s*</.test(text))
        throw new Error('geofile-content');
    if (kind === 'singbox-json') {
        const value = JSON.parse(text);
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
}

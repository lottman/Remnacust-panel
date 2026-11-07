import type { DatRules } from './compile-dat';

import { Address4, Address6 } from 'ip-address';
import { isIP } from 'node:net';
import { setImmediate } from 'node:timers/promises';

import { MAX_GEOFILE_BYTES } from './download-geofile';
import { datClientFile } from './geofile-delivery';
import {
    GeofileKind,
    geofileFields,
    validateGeofile,
    validateDatSteps as validateDatContentSteps,
} from './validate-geofile';
import { datCategory } from './xray-geofile-delivery';

export const MAX_GEOFILE_TEXT_BYTES = 8 * 1024 * 1024;
const CLIENT_FORMATS = ['XRAY_JSON', 'SINGBOX', 'MIHOMO', 'CLASH', 'STASH'] as const;
export interface GeofileSelection {
    format: (typeof CLIENT_FORMATS)[number];
    categories: string[];
}
export function parseGeofileSelections(value: unknown, query = false): GeofileSelection[] {
    if (value === undefined) return [];
    if (query) {
        if (typeof value !== 'string' || Buffer.byteLength(value) > 2048)
            throw Error('geofile-copy-selections');
        value = JSON.parse(value);
    }
    if (
        !Array.isArray(value) ||
        value.length > 32 ||
        Buffer.byteLength(JSON.stringify(value)) > 32 * 1024
    )
        throw Error('geofile-copy-selections');
    for (const selection of value) {
        if (
            !selection ||
            typeof selection !== 'object' ||
            Array.isArray(selection) ||
            Object.keys(selection).some((k) => !['format', 'categories'].includes(k)) ||
            !CLIENT_FORMATS.includes(selection.format) ||
            !Array.isArray(selection.categories) ||
            selection.categories.length > 32 ||
            selection.categories.some(
                (code: unknown) =>
                    typeof code !== 'string' ||
                    !/^[a-zA-Z0-9_.!+-]+(?:@[a-zA-Z0-9_.!+-]+)?$/.test(code),
            )
        )
            throw Error('geofile-copy-selections');
    }
    return value as GeofileSelection[];
}
const TYPES = ['keyword', 'regexp', 'domain', 'full'] as const;
type RecordType = (typeof TYPES)[number] | 'ip';
export interface GeofileEdit {
    sha256?: unknown;
    name?: unknown;
    category?: unknown;
    changes?: unknown;
    additions?: unknown;
    text?: unknown;
    selections?: unknown;
}
interface RecordEdit {
    index?: number;
    remove?: boolean;
    type?: RecordType;
    value?: string;
}
type Field = ReturnType<typeof geofileFields> extends Generator<infer T> ? T : never;

function varint(value: number): Buffer {
    const bytes: number[] = [];
    do {
        bytes.push((value & 127) | (value > 127 ? 128 : 0));
        value = Math.floor(value / 128);
    } while (value);
    return Buffer.from(bytes);
}
function bytes(field: number, value: Buffer): Buffer {
    return Buffer.concat([varint(field * 8 + 2), varint(value.length), value]);
}
function integer(field: number, value: number): Buffer {
    return Buffer.concat([varint(field * 8), varint(value)]);
}
function raw(data: Buffer, field: Field): Buffer {
    return data.subarray(field.start!, field.end!);
}
function* preservedFields(data: Buffer): Generator<Field> {
    let offset = 0;
    for (const field of geofileFields(data, true)) {
        if (field.start! > offset)
            yield {
                field: 0,
                value: data.subarray(offset, field.start),
                start: offset,
                end: field.start,
            };
        yield field;
        offset = field.end!;
    }
    if (offset < data.length)
        yield { field: 0, value: data.subarray(offset), start: offset, end: data.length };
}
function* categoryNameSteps(entry: Buffer): Generator<void, string> {
    let work = 0;
    let name = '';
    for (const field of geofileFields(entry)) {
        if (++work % 1000 === 0) yield;
        if (field.field === 1 && Buffer.isBuffer(field.value))
            name = field.value.toString('utf8').toLowerCase();
    }
    return name;
}
function category(value: unknown): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_@.\-!+]{1,128}$/.test(value))
        throw Error('geofile-category');
    return value.toLowerCase();
}
function* decodeSteps(
    record: Buffer,
    kind: GeofileKind,
    index: number,
): Generator<void, { index: number; type: RecordType; value: string; attributeCount?: number }> {
    let first: Buffer | number | undefined, second: Buffer | number | undefined;
    let attributeCount = 0,
        work = 0;
    for (const field of geofileFields(record)) {
        if (++work % 1000 === 0) yield;
        if (
            field.field === 1 &&
            (kind === 'geoip' ? Buffer.isBuffer(field.value) : typeof field.value === 'number')
        )
            first = field.value;
        if (
            field.field === 2 &&
            (kind === 'geoip' ? typeof field.value === 'number' : Buffer.isBuffer(field.value))
        )
            second = field.value;
        if (field.field === 3 && Buffer.isBuffer(field.value)) attributeCount++;
    }
    if (kind === 'geoip') {
        const ip = first as Buffer;
        const host =
            ip.length === 4 ? [...ip].join('.') : Address6.fromByteArray([...ip]).correctForm();
        return { index, type: 'ip' as RecordType, value: `${host}/${second ?? 0}` };
    }
    return {
        index,
        type: TYPES[Number(first ?? 0)],
        value: (second as Buffer).toString('utf8'),
        attributeCount,
    };
}

function* contentSteps(
    data: Buffer,
    kind: GeofileKind,
    query: {
        category?: unknown;
        page?: unknown;
        limit?: unknown;
        search?: unknown;
    },
) {
    if (
        kind === 'singbox-srs' ||
        (!['geoip', 'geosite'].includes(kind) && data.length > MAX_GEOFILE_TEXT_BYTES)
    )
        return { mode: 'binary' as const, records: [], maxTextBytes: MAX_GEOFILE_TEXT_BYTES };
    if (kind !== 'geoip' && kind !== 'geosite')
        return {
            mode: 'text' as const,
            records: [],
            text: new TextDecoder('utf-8', { fatal: true }).decode(data),
            maxTextBytes: MAX_GEOFILE_TEXT_BYTES,
        };
    const selected = category(query.category);
    const page = query.page === undefined ? 1 : Number(query.page);
    const limit = query.limit === undefined ? 100 : Number(query.limit);
    if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        page > 1_000_000 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 200 ||
        (query.search !== undefined &&
            (typeof query.search !== 'string' || query.search.length > 256))
    )
        throw Error('geofile-page');
    const search = (query.search as string | undefined)?.toLowerCase() ?? '';
    const records: Array<{
        index: number;
        type: RecordType;
        value: string;
        attributeCount?: number;
    }> = [];
    let work = 0;
    let index = 0,
        total = 0,
        found = false;
    for (const entry of geofileFields(data)) {
        if (!Buffer.isBuffer(entry.value) || (yield* categoryNameSteps(entry.value)) !== selected)
            continue;
        found = true;
        for (const record of geofileFields(entry.value)) {
            if (++work % 1000 === 0) yield;
            if (record.field !== 2 || !Buffer.isBuffer(record.value)) continue;
            const absolute = index++;
            if (!search && (total < (page - 1) * limit || records.length >= limit)) {
                total++;
                continue;
            }
            const item = yield* decodeSteps(record.value, kind, absolute);
            if (search && !item.value.toLowerCase().includes(search)) continue;
            if (total >= (page - 1) * limit && records.length < limit) records.push(item);
            total++;
        }
    }
    if (!found) throw Error('geofile-category');
    return { mode: 'dat' as const, category: selected, records, total, page, limit };
}

function validateRecord(value: unknown, kind: GeofileKind, change: boolean): RecordEdit {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('geofile-record');
    const item = value as RecordEdit;
    if (
        Object.keys(item).some(
            (k) => !(change ? ['index', 'remove', 'type', 'value'] : ['type', 'value']).includes(k),
        )
    )
        throw Error('geofile-record');
    if (change && (!Number.isSafeInteger(item.index) || item.index! < 0))
        throw Error('geofile-index');
    if (item.remove !== undefined && typeof item.remove !== 'boolean')
        throw Error('geofile-record');
    if (item.remove) {
        if (item.type !== undefined || item.value !== undefined) throw Error('geofile-record');
        return item;
    }
    if (item.value !== undefined || !change) {
        if (
            typeof item.value !== 'string' ||
            !item.value ||
            Buffer.byteLength(item.value) > 4096 ||
            [...item.value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
        )
            throw Error('geofile-record');
    }
    if (item.type !== undefined || !change) {
        if (
            kind === 'geoip'
                ? item.type !== 'ip'
                : !TYPES.includes(item.type as (typeof TYPES)[number])
        )
            throw Error('geofile-record');
    }
    return item;
}
function* encodeSteps(item: RecordEdit, kind: GeofileKind, old?: Buffer): Generator<void, Buffer> {
    if (old) {
        if (item.type === undefined && item.value === undefined) return old;
        const previous = yield* decodeSteps(old, kind, 0);
        item = { ...item, type: item.type ?? previous.type, value: item.value ?? previous.value };
    }
    let first: Buffer, second: Buffer;
    if (kind === 'geoip') {
        const match = /^([^/]+)\/(\d{1,3})$/.exec(item.value!);
        if (!match || !isIP(match[1])) throw Error('geofile-ip');
        const prefix = Number(match[2]);
        if (prefix > (isIP(match[1]) === 4 ? 32 : 128)) throw Error('geofile-ip');
        const address =
            isIP(match[1]) === 4
                ? new Address4(match[1]).toArray()
                : new Address6(match[1]).toUnsignedByteArray();
        first = bytes(1, Buffer.from(address));
        second = integer(2, prefix);
    } else {
        first = integer(1, TYPES.indexOf(item.type as (typeof TYPES)[number]));
        second = bytes(2, Buffer.from(item.value!));
    }
    const preserved: Buffer[] = [];
    let work = 0;
    if (old)
        for (const field of preservedFields(old)) {
            if (++work % 1000 === 0) yield;
            if (field.field !== 1 && field.field !== 2) preserved.push(raw(old, field));
        }
    return Buffer.concat([first, second, ...preserved]);
}

function* editSteps(data: Buffer, kind: GeofileKind, patch: GeofileEdit): Generator<void, Buffer> {
    if (
        !patch ||
        typeof patch !== 'object' ||
        Array.isArray(patch) ||
        Object.keys(patch).some(
            (k) =>
                ![
                    'sha256',
                    'name',
                    'category',
                    'changes',
                    'additions',
                    'text',
                    'selections',
                ].includes(k),
        )
    )
        throw Error('geofile-edit');
    if (kind !== 'geoip' && kind !== 'geosite') {
        if (
            patch.category !== undefined ||
            patch.changes !== undefined ||
            patch.additions !== undefined ||
            (kind === 'singbox-srs' && patch.text !== undefined)
        )
            throw Error('geofile-edit-mode');
        if (patch.text === undefined) {
            validateGeofile(data, kind);
            return data;
        }
        if (
            typeof patch.text !== 'string' ||
            Buffer.byteLength(patch.text) > MAX_GEOFILE_TEXT_BYTES
        )
            throw Error('geofile-text-size');
        const edited = Buffer.from(patch.text);
        validateGeofile(edited, kind);
        return edited;
    }
    if (patch.text !== undefined) throw Error('geofile-edit-mode');
    if (patch.changes === undefined && patch.additions === undefined) {
        yield* validateDatSteps(data, kind);
        return data;
    }
    const selected = category(patch.category);
    if (
        (patch.changes !== undefined && !Array.isArray(patch.changes)) ||
        (patch.additions !== undefined && !Array.isArray(patch.additions))
    )
        throw Error('geofile-record');
    const changes = (patch.changes ?? []) as unknown[],
        additions = (patch.additions ?? []) as unknown[];
    if (changes.length + additions.length > 1000) throw Error('geofile-edit-size');
    const updates = new Map<number, RecordEdit>();
    for (const value of changes) {
        const item = validateRecord(value, kind, true);
        if (updates.has(item.index!)) throw Error('geofile-index');
        updates.set(item.index!, item);
    }
    const added: Buffer[] = [];
    for (const value of additions)
        added.push(bytes(2, yield* encodeSteps(validateRecord(value, kind, false), kind)));
    let work = 0;
    let index = 0,
        found = false,
        appended = false;
    const chunks: Buffer[] = [];
    for (const entry of preservedFields(data)) {
        if (
            entry.field !== 1 ||
            !Buffer.isBuffer(entry.value) ||
            (yield* categoryNameSteps(entry.value)) !== selected
        ) {
            chunks.push(raw(data, entry));
            continue;
        }
        found = true;
        const parts: Buffer[] = [];
        let records = 0;
        for (const field of preservedFields(entry.value)) {
            if (++work % 1000 === 0) yield;
            if (field.field !== 2 || !Buffer.isBuffer(field.value)) {
                parts.push(raw(entry.value, field));
                continue;
            }
            const update = updates.get(index++);
            if (update) updates.delete(index - 1);
            if (update?.remove) continue;
            parts.push(
                update
                    ? bytes(2, yield* encodeSteps(update, kind, field.value))
                    : raw(entry.value, field),
            );
            records++;
        }
        if (!appended) {
            parts.push(...added);
            records += added.length;
            appended = true;
        }
        if (!records) throw Error('geofile-category-empty');
        chunks.push(bytes(1, Buffer.concat(parts)));
    }
    if (!found || updates.size) throw Error('geofile-index');
    const edited = Buffer.concat(chunks);
    yield* validateDatSteps(edited, kind);
    return edited;
}

function* validateDatSteps(data: Buffer, kind: GeofileKind): Generator<void, void> {
    if (kind !== 'geoip' && kind !== 'geosite') {
        validateGeofile(data, kind);
        return;
    }
    yield* validateDatContentSteps(data, kind);
}

function* categoriesSteps(data: Buffer): Generator<void, string[]> {
    const codes = new Set<string>();
    for (const entry of geofileFields(data)) {
        if (entry.field !== 1 || !Buffer.isBuffer(entry.value)) continue;
        codes.add(yield* categoryNameSteps(entry.value));
    }
    return [...codes].sort();
}

function* compileSteps(
    data: Buffer,
    kind: 'geoip' | 'geosite',
    categories: string[],
    validateOnly = false,
): Generator<void, DatRules> {
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
        throw Error('geofile-categories');
    const wanted = new Set(categories.map((code) => code.toLowerCase()));
    const seen = new Set<string>(),
        matchers = new Set<string>();
    const result: DatRules = { ips: [], domains: [] };
    let bytes = 0,
        matched = false,
        work = 0;
    for (const entry of geofileFields(data)) {
        if (!Buffer.isBuffer(entry.value)) continue;
        let code: Buffer | number | undefined,
            reverse = false;
        for (const field of geofileFields(entry.value)) {
            if (++work % 1000 === 0) yield;
            if (field.field === 1 && Buffer.isBuffer(field.value)) code = field.value;
            if (field.field === 3 && typeof field.value === 'number') reverse = field.value !== 0;
        }
        if (!Buffer.isBuffer(code)) continue;
        const codeName = code.toString('utf8').toLowerCase();
        const requests = [...wanted].filter((value) => value.split('@')[0] === codeName);
        if (!requests.length) continue;
        requests.forEach((value) => seen.add(value));
        if (kind === 'geoip' && reverse) throw Error('geofile-reverse-cidr');
        if (kind === 'geoip' && requests.some((value) => value.includes('@')))
            throw Error('geofile-categories');
        for (const record of geofileFields(entry.value)) {
            if (++work % 1000 === 0) yield;
            if (record.field !== 2 || !Buffer.isBuffer(record.value)) continue;
            let first: Buffer | number | undefined, second: Buffer | number | undefined;
            let selected = requests.some((value) => !value.includes('@'));
            for (const part of geofileFields(record.value)) {
                if (++work % 1000 === 0) yield;
                if (
                    part.field === 1 &&
                    (kind === 'geoip'
                        ? Buffer.isBuffer(part.value)
                        : typeof part.value === 'number')
                )
                    first = part.value;
                if (
                    part.field === 2 &&
                    (kind === 'geoip'
                        ? typeof part.value === 'number'
                        : Buffer.isBuffer(part.value))
                )
                    second = part.value;
                if (
                    kind === 'geosite' &&
                    !selected &&
                    part.field === 3 &&
                    Buffer.isBuffer(part.value)
                ) {
                    let key: Buffer | undefined;
                    for (const attr of geofileFields(part.value)) {
                        if (++work % 1000 === 0) yield;
                        if (attr.field === 1 && Buffer.isBuffer(attr.value)) key = attr.value;
                    }
                    if (
                        key &&
                        requests.some((value) => value.split('@')[1] === key.toString('utf8'))
                    )
                        selected = true;
                }
            }
            if (kind === 'geoip') {
                if (!Buffer.isBuffer(first)) throw Error('geofile-dat');
                matched = true;
                if (validateOnly) continue;
                const address =
                    first.length === 4
                        ? [...first].join('.')
                        : Address6.fromByteArray([...first]).correctForm();
                const value = `${address}/${second ?? 0}`;
                if (matchers.has(value)) continue;
                matchers.add(value);
                result.ips.push(value);
                bytes += value.length;
            } else {
                if (!selected) continue;
                if (!Buffer.isBuffer(second)) throw Error('geofile-dat');
                matched = true;
                if (validateOnly) continue;
                const value = second.toString('utf8'),
                    type = Number(first ?? 0),
                    key = `${type}:${value}`;
                if (matchers.has(key)) continue;
                matchers.add(key);
                result.domains.push({ type, value });
                bytes += value.length;
            }
            if (result.ips.length + result.domains.length > 50_000 || bytes > 2 * 1024 * 1024)
                throw Error('geofile-inline-limit');
        }
    }
    if ([...wanted].some((value) => !seen.has(value)) || !matched)
        throw Error('geofile-category-empty');
    return result;
}

function* nativeValidationSteps(data: Buffer, id: string): Generator<void, void> {
    const seen = new Set<string>();
    let total = 0,
        count = 0,
        work = 0;
    for (const entry of geofileFields(data)) {
        if (entry.field !== 1 || !Buffer.isBuffer(entry.value)) throw Error('geofile-dat');
        const names: Field[] = [];
        for (const field of geofileFields(entry.value, true)) {
            if (++work % 1000 === 0) yield;
            if (field.field === 1 && Buffer.isBuffer(field.value)) names.push(field);
        }
        const name = names.at(-1)?.value;
        if (!Buffer.isBuffer(name) || ++count > 50_000) throw Error('geofile-complexity');
        const replaced = bytes(
            1,
            Buffer.from(datCategory(id, name.toString('utf8'), 2).toUpperCase()),
        );
        const code = name.toString('utf8').toLowerCase();
        if (seen.has(code)) throw Error('geofile-duplicate-category');
        seen.add(code);
        let size = entry.value.length;
        for (const field of names) size += replaced.length - (field.end! - field.start!);
        total += 1 + varint(size).length + size;
        if (total > MAX_GEOFILE_BYTES) throw Error('geofile-size');
    }
    if (!count) throw Error('geofile-dat');
}

function runSync<T>(steps: Generator<void, T>): T {
    for (;;) {
        const next = steps.next();
        if (next.done) return next.value;
    }
}
async function runCooperative<T>(steps: Generator<void, T>): Promise<T> {
    for (;;) {
        const next = steps.next();
        if (next.done) return next.value;
        await setImmediate();
    }
}
export function geofileContent(...args: Parameters<typeof contentSteps>) {
    return runSync(contentSteps(...args));
}
export function geofileContentAsync(...args: Parameters<typeof contentSteps>) {
    return runCooperative(contentSteps(...args));
}
export function editGeofile(...args: Parameters<typeof editSteps>) {
    return runSync(editSteps(...args));
}
export function editGeofileAsync(...args: Parameters<typeof editSteps>) {
    return runCooperative(editSteps(...args));
}
export function validateGeofileAsync(data: Buffer, kind: GeofileKind) {
    return runCooperative(validateDatSteps(data, kind));
}
export function datCategoriesAsync(data: Buffer) {
    return runCooperative(categoriesSteps(data));
}
export function compileDatAsync(...args: Parameters<typeof compileSteps>) {
    return runCooperative(compileSteps(...args));
}
export function validateNativeDatAsync(data: Buffer, id: string) {
    return runCooperative(nativeValidationSteps(data, id));
}

export async function validateGeofileSelections(
    data: Buffer,
    kind: GeofileKind,
    selections: GeofileSelection[],
    id: string,
): Promise<void> {
    for (const selection of selections) {
        if (kind === 'geoip' || kind === 'geosite') {
            try {
                const rules = await compileDatAsync(data, kind, selection.categories);
                if (selection.format !== 'XRAY_JSON') datClientFile(rules, selection.format);
            } catch (error) {
                if (
                    selection.format !== 'XRAY_JSON' ||
                    !(error instanceof Error) ||
                    error.message !== 'geofile-inline-limit'
                )
                    throw error;
                await compileDatAsync(data, kind, selection.categories, true);
            }
            if (selection.format === 'XRAY_JSON') await validateNativeDatAsync(data, id);
        } else {
            if (
                selection.categories.length ||
                (kind.startsWith('singbox-')
                    ? selection.format !== 'SINGBOX'
                    : !['MIHOMO', 'CLASH', 'STASH'].includes(selection.format) ||
                      (kind.startsWith('mihomo-text-') && selection.format !== 'MIHOMO'))
            )
                throw Error('geofile-format-client');
        }
    }
}

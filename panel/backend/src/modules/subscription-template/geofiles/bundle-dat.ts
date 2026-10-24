import { MAX_GEOFILE_BYTES } from './download-geofile';
import { geofileFields } from './validate-geofile';
import { datCategory } from './xray-geofile-delivery';

function varint(value: number): Buffer {
    const bytes: number[] = [];
    do {
        bytes.push((value & 127) | (value > 127 ? 128 : 0));
        value = Math.floor(value / 128);
    } while (value);
    return Buffer.from(bytes);
}

function message(value: Buffer): Buffer {
    return Buffer.concat([Buffer.from([10]), varint(value.length), value]);
}

// Preserve domain attributes, reverse CIDR flags and unknown protobuf fields byte-for-byte.
export function bundleDat(
    files: Array<{ id: string; data: Buffer }>,
    namespace: 1 | 2 = 2,
): Buffer {
    const chunks: Buffer[] = [];
    const seen = new Set<string>();
    let bytes = 0,
        count = 0;
    for (const file of files) {
        for (const entry of geofileFields(file.data)) {
            if (entry.field !== 1 || !Buffer.isBuffer(entry.value)) throw new Error('geofile-dat');
            const fields = [...geofileFields(entry.value, true)];
            const names = fields.filter(
                (field) => field.field === 1 && Buffer.isBuffer(field.value),
            );
            const original = names.at(-1)?.value;
            if (!Buffer.isBuffer(original) || ++count > 50_000)
                throw new Error('geofile-complexity');
            const name = datCategory(file.id, original.toString('utf8'), namespace).toUpperCase();
            if (seen.has(name)) throw new Error('geofile-duplicate-category');
            seen.add(name);
            const replacement = message(Buffer.from(name));
            const parts: Buffer[] = [];
            let offset = 0;
            for (const field of names) {
                parts.push(entry.value.subarray(offset, field.start!), replacement);
                offset = field.end!;
            }
            parts.push(entry.value.subarray(offset));
            const renamed = message(Buffer.concat(parts));
            bytes += renamed.length;
            if (bytes > MAX_GEOFILE_BYTES) throw new Error('geofile-size');
            chunks.push(renamed);
        }
    }
    if (!chunks.length) throw new Error('geofile-dat');
    return Buffer.concat(chunks, bytes);
}

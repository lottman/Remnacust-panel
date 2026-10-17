import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { z } from 'zod';

import { frameDigest, parseUsageReceiptResponse, USAGE_RECEIPTS } from './usage-receipt';

export const USAGE_ARCHIVE_VERSION = 'remnacust-usage-archives-v1';
export const USAGE_ARCHIVE_MAX_BYTES = 12 * 1024 * 1024;
export const USAGE_JOURNAL_MAX_BYTES = 8 * 1024 * 1024 + 128;
const expand = promisify(gunzip);
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const identity = z
    .uuid()
    .refine(
        (value) =>
            value === value.toLowerCase() &&
            value !== '00000000-0000-0000-0000-000000000000' &&
            value !== 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    );
const integer = z
    .string()
    .regex(/^(0|[1-9][0-9]{0,18})$/)
    .refine((value) => BigInt(value) <= 9223372036854775807n);
const positive = integer.refine((value) => value !== '0');
const frame = z.strictObject({
    sequence: positive,
    coreProcessId: identity,
    capturedAt: positive,
    stats: z
        .array(z.strictObject({ name: z.string().min(1).max(1024), value: positive }))
        .max(100000),
});
const journal = z.strictObject({
    version: z.literal(1),
    stream: identity,
    acked: integer,
    ackDigest: z.string(),
    pending: frame.nullable(),
});

export function readPersistedUsageJournal(original: Buffer) {
    const magic = Buffer.from('REMNACUST-USAGE-1\n');
    if (
        original.length > USAGE_JOURNAL_MAX_BYTES ||
        !original.subarray(0, magic.length).equals(magic) ||
        original[magic.length + 64] !== 10
    )
        throw new Error('Invalid usage journal header');
    const payload = original.subarray(magic.length + 65);
    if (
        payload.length > 8 * 1024 * 1024 ||
        original.subarray(magic.length, magic.length + 64).toString() !== hash(payload)
    )
        throw new Error('Invalid usage journal checksum');
    const text = payload.toString('utf8');
    if (!Buffer.from(text).equals(payload)) throw new Error('Invalid usage journal encoding');
    const state = journal.parse(JSON.parse(text));
    if (
        (state.acked === '0' && state.ackDigest !== '') ||
        (state.acked !== '0' && !digest.safeParse(state.ackDigest).success)
    )
        throw new Error('Invalid usage acknowledgement');
    if (state.pending) {
        if (BigInt(state.pending.sequence) !== BigInt(state.acked) + 1n)
            throw new Error('Invalid pending sequence');
        parseUsageReceiptResponse(
            {
                action: 'sample',
                stream: state.stream,
                sequence: state.pending.sequence,
                coreProcessId: state.pending.coreProcessId,
            },
            {
                capability: USAGE_RECEIPTS,
                stream: state.stream,
                ...state.pending,
                digest: frameDigest(state.pending),
            },
        );
    }
    return state;
}

export function parsePersistedUsageJournal(original: Buffer) {
    const state = readPersistedUsageJournal(original);
    return {
        stream: state.stream,
        acked: state.acked,
        ackDigest: state.ackDigest,
        pending: state.pending
            ? {
                  sequence: state.pending.sequence,
                  coreProcessId: state.pending.coreProcessId,
                  capturedAt: state.pending.capturedAt,
                  counters: state.pending.stats.length,
                  digest: frameDigest(state.pending),
              }
            : null,
    };
}
export type UsageArchiveMetadata = ReturnType<typeof parsePersistedUsageJournal>;

const canonicalBase64 = (text: string, maximum: number) => {
    if (text.length > Math.ceil(maximum / 3) * 4)
        throw new Error('Usage archive capacity exceeded');
    const data = Buffer.from(text, 'base64');
    if (data.length > maximum || data.toString('base64') !== text)
        throw new Error('Invalid usage archive encoding');
    return data;
};

export async function decodeUsageArchive(
    value: unknown,
    request: { generation: string; requestId: string },
) {
    const envelope = z
        .strictObject({
            version: z.literal(USAGE_ARCHIVE_VERSION),
            encoding: z.literal('gzip-base64'),
            bytes: z.int().positive().max(USAGE_ARCHIVE_MAX_BYTES),
            sha256: digest,
            data: z.string().max(Math.ceil((USAGE_ARCHIVE_MAX_BYTES + 65536) / 3) * 4),
        })
        .parse(value);
    const encoded = canonicalBase64(envelope.data, USAGE_ARCHIVE_MAX_BYTES + 65536);
    const raw = await expand(encoded, { maxOutputLength: USAGE_ARCHIVE_MAX_BYTES });
    if (raw.length !== envelope.bytes || hash(raw) !== envelope.sha256)
        throw new Error('Usage archive checksum differs');
    const text = raw.toString('utf8');
    if (!Buffer.from(text).equals(raw)) throw new Error('Invalid usage archive encoding');
    const snapshot = z
        .strictObject({
            version: z.literal(USAGE_ARCHIVE_VERSION),
            generation: z.uuid(),
            requestId: z.uuid(),
            capturedAt: z.int().positive().max(253402300799999),
            journal: z
                .strictObject({
                    bytes: z.int().min(0).max(USAGE_JOURNAL_MAX_BYTES),
                    sha256: digest,
                    data: z.string().max(Math.ceil(USAGE_JOURNAL_MAX_BYTES / 3) * 4),
                })
                .nullable(),
        })
        .parse(JSON.parse(text));
    if (snapshot.generation !== request.generation || snapshot.requestId !== request.requestId)
        throw new Error('Usage archive request differs');
    const original = snapshot.journal
        ? canonicalBase64(snapshot.journal.data, USAGE_JOURNAL_MAX_BYTES)
        : null;
    if (
        snapshot.journal &&
        (original!.length !== snapshot.journal.bytes || hash(original!) !== snapshot.journal.sha256)
    )
        throw new Error('Original usage journal checksum differs');
    let state: 'PRESENT' | 'ABSENT' | 'INVALID' = original === null ? 'ABSENT' : 'PRESENT';
    let metadata: UsageArchiveMetadata | null = null;
    if (original !== null) {
        try {
            metadata = parsePersistedUsageJournal(original);
        } catch {
            state = 'INVALID';
        }
    }
    return {
        state,
        metadata,
        original,
        sourceDigest: snapshot.journal?.sha256 ?? null,
        payloadDigest: envelope.sha256,
        capturedAt: snapshot.capturedAt,
    };
}

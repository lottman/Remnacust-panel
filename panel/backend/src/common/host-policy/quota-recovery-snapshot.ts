import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { z } from 'zod';

import { recoveryFenceStateSchema } from './quota-recovery-fence';
import { recoveryEntrySchema } from './quota-recovery-report';

const VERSION = 'remnacust-quota-snapshots-v1';
const MAX_BYTES = 32 * 1024 * 1024;
const decompress = promisify(gunzip);
const snapshotSchema = z.strictObject({
    version: z.literal(VERSION),
    generation: z.uuid(),
    requestId: z.uuid(),
    instance: z.uuid(),
    sequence: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    checkpoint: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    retiredBefore: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    registrationsRequired: z.boolean(),
    watermarksRequired: z.literal(true),
    policyRevision: recoveryEntrySchema.shape.ceiling,
    coreProcessId: z.uuid(),
    recovery: recoveryFenceStateSchema.optional(),
    capturedAt: z.int().positive().max(Number.MAX_SAFE_INTEGER),
    entries: z.array(recoveryEntrySchema).max(100000),
});
const envelopeSchema = z.strictObject({
    version: z.literal(VERSION),
    encoding: z.literal('gzip-base64'),
    bytes: z.int().positive().max(MAX_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    data: z
        .string()
        .min(4)
        .max(Math.ceil((MAX_BYTES + 65536) / 3) * 4),
});
export type RecoverySnapshot = z.infer<typeof snapshotSchema> & {
    digest: string;
    encoded: Buffer;
    bytes: number;
};

export async function decodeRecoverySnapshot(
    value: unknown,
    request: { generation: string; requestId: string },
): Promise<RecoverySnapshot> {
    const envelope = envelopeSchema.parse(value);
    // Buffer's permissive base64 decoder must not accept alternate encodings.
    const compressed = Buffer.from(envelope.data, 'base64');
    if (compressed.toString('base64') !== envelope.data)
        throw new Error('Invalid snapshot encoding');
    const raw = await decompress(compressed, { maxOutputLength: MAX_BYTES });
    if (
        raw.length !== envelope.bytes ||
        createHash('sha256').update(raw).digest('hex') !== envelope.sha256
    )
        throw new Error('Invalid snapshot digest');
    const snapshot = snapshotSchema.parse(JSON.parse(raw.toString('utf8')));
    if (
        snapshot.generation !== request.generation ||
        snapshot.requestId !== request.requestId ||
        snapshot.checkpoint > snapshot.sequence ||
        !snapshot.registrationsRequired
    )
        throw new Error('Invalid snapshot binding');
    let previous = '';
    for (const entry of snapshot.entries) {
        if (
            entry.id !== entry.id.toLowerCase() ||
            entry.id <= previous ||
            BigInt(entry.reserved) > BigInt(entry.ceiling) ||
            (entry.activated && !entry.prepared) ||
            (entry.prepared && !entry.activated && entry.reserved !== '0')
        )
            throw new Error('Invalid snapshot journal');
        previous = entry.id;
    }
    return { ...snapshot, digest: envelope.sha256, encoded: compressed, bytes: raw.length };
}

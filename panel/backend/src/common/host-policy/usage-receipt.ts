import { createHash } from 'node:crypto';
import { z } from 'zod';

import { isUsageCounter } from './unreserved-usage';

export const USAGE_RECEIPTS = 'remnacust-usage-receipts-v1';
const decimal = z
    .string()
    .regex(/^[1-9][0-9]{0,18}$/)
    .refine((value) => BigInt(value) <= 9223372036854775807n);
const identity = z
    .uuid()
    .refine(
        (value) =>
            value === value.toLowerCase() &&
            value !== '00000000-0000-0000-0000-000000000000' &&
            value !== 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    );
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const common = { stream: identity, sequence: decimal, coreProcessId: identity };
export const usageReceiptRequest = z.discriminatedUnion('action', [
    z.object({ ...common, action: z.literal('sample') }).strict(),
    z.object({ ...common, action: z.literal('ack'), digest }).strict(),
]);
export const sampleResponse = z
    .object({
        ...common,
        capability: z.literal(USAGE_RECEIPTS),
        capturedAt: decimal.refine((value) => BigInt(value) <= 253402300799999n),
        digest,
        stats: z
            .array(z.object({ name: z.string().min(1).max(1024), value: decimal }).strict())
            .max(100000),
    })
    .strict();
const ackResponse = z
    .object({ stream: identity, sequence: decimal, acknowledged: z.literal(true) })
    .strict();
export type UsageReceiptRequest = z.infer<typeof usageReceiptRequest>;

// Go's encoding/json escapes these characters in the signed frame payload.
export function frameDigest(frame: unknown): string {
    const encoded = JSON.stringify(frame).replace(
        /[<>&\u2028\u2029]/g,
        (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
    return createHash('sha256').update(encoded).digest('hex');
}

export function parseUsageReceiptResponse(request: UsageReceiptRequest, value: unknown) {
    const result =
        request.action === 'sample' ? sampleResponse.parse(value) : ackResponse.parse(value);
    if (result.stream !== request.stream || result.sequence !== request.sequence)
        throw new Error('Usage receipt binding differs');
    if ('stats' in result) {
        if (result.coreProcessId !== request.coreProcessId)
            throw new Error('Usage receipt core differs');
        let previous = '';
        for (const stat of result.stats) {
            if (
                Buffer.compare(Buffer.from(stat.name), Buffer.from(previous)) <= 0 ||
                !isUsageCounter(stat.name)
            )
                throw new Error('Invalid or duplicate usage counter');
            previous = stat.name;
        }
        if (
            frameDigest({
                sequence: result.sequence,
                coreProcessId: result.coreProcessId,
                capturedAt: result.capturedAt,
                stats: result.stats,
            }) !== result.digest
        )
            throw new Error('Usage receipt digest differs');
    }
    return result;
}

import { createHash } from 'node:crypto';
import { z } from 'zod';

import { recoveryUsageAckReply } from './recovery-usage-ack';
import { readPersistedUsageJournal } from './usage-archive';
import { frameDigest, usageReceiptRequest } from './usage-receipt';

const integer = z
    .string()
    .regex(/^(0|[1-9][0-9]{0,18})$/)
    .refine((value) => BigInt(value) <= 9223372036854775807n);
export const recoveryTailIdentity = usageReceiptRequest.options[0].shape.stream;
export const recoveryTailInput = z.strictObject({
    requestId: recoveryTailIdentity,
    generation: recoveryTailIdentity,
    acknowledgementRequest: recoveryTailIdentity,
    consumptionMultiplier: integer,
    note: z.string().trim().min(10).max(2000),
});
export type RecoveryTailInput = z.infer<typeof recoveryTailInput>;

export function recoveryTailPlan(
    acknowledgement: unknown,
    original: Buffer,
    liveCore: string,
    consumptionMultiplier: string,
) {
    const ack = recoveryUsageAckReply.parse(acknowledgement);
    usageReceiptRequest.options[0].shape.coreProcessId.parse(liveCore);
    integer.parse(consumptionMultiplier);
    const journal = readPersistedUsageJournal(original);
    if (
        ack.recovery.state !== 'FENCED' ||
        ack.recovery.generation !== ack.generation ||
        ack.recovery.digest !== ack.previous ||
        ack.acknowledgement.stream !== ack.instance ||
        ack.journal.stream !== ack.instance ||
        ack.acknowledgement.sequence !== ack.journal.acked ||
        journal.stream !== ack.instance ||
        journal.acked !== ack.journal.acked ||
        journal.ackDigest !== ack.journal.ackDigest
    )
        throw Error('Recovery tail source differs from acknowledged receipt');
    if (
        ack.journal.pending &&
        (!journal.pending ||
            journal.pending.sequence !== ack.journal.pending.sequence ||
            journal.pending.coreProcessId !== ack.journal.pending.coreProcessId ||
            frameDigest(journal.pending) !== ack.journal.pending.digest)
    )
        throw Error('Previously observed next packet was lost or changed');
    if (BigInt(journal.acked) === 9223372036854775807n) throw Error('Usage sequence is exhausted');
    // A retained frame may belong to a previous core incarnation. Absence of
    // a frame is a request to sample, never proof of empty counters.
    const sample = usageReceiptRequest.options[0].parse({
        action: 'sample',
        stream: journal.stream,
        sequence: String(BigInt(journal.acked) + 1n),
        coreProcessId: journal.pending?.coreProcessId ?? liveCore,
    });
    return {
        version: 'remnacust-recovery-tail-v1' as const,
        sample,
        consumptionMultiplier,
        previous: { sequence: journal.acked, digest: journal.ackDigest },
        journalDigest: createHash('sha256').update(original).digest('hex'),
        retainedDigest: journal.pending ? frameDigest(journal.pending) : null,
        requiresSampling: journal.pending === null,
    };
}

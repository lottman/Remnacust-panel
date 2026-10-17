import { createHash } from 'node:crypto';
import { z } from 'zod';

import { recoveryFenceSchema } from './quota-recovery-fence';
import { recoveryUsageAckReply } from './recovery-usage-ack';
import {
    recoveryUsageSampleRequest,
    type RecoveryUsageSampleRequest,
} from './recovery-usage-sample';
import { parseUsageReceiptResponse, sampleResponse } from './usage-receipt';

export const RECOVERY_QUIESCENCE = 'remnacust-recovery-quiescence-v1';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const base = z.strictObject({
    version: z.literal(RECOVERY_QUIESCENCE),
    request: recoveryUsageSampleRequest,
    frame: sampleResponse,
    fence: recoveryFenceSchema,
    journalDigest: digest,
    digest,
});
type Witness = z.infer<typeof base>;
function binding(request: RecoveryUsageSampleRequest) {
    return [
        request.requestId,
        request.generation,
        request.coreProcessId,
        request.instance,
        request.previous,
        request.preparationDigest,
        request.sourceDigest,
        request.retainedDigest,
        request.prior.sequence,
        request.prior.digest,
        request.receipt.stream,
        request.receipt.sequence,
        request.receipt.coreProcessId,
    ];
}
function checksum(value: Omit<Witness, 'digest'>) {
    return createHash('sha256')
        .update(
            JSON.stringify([
                value.version,
                ...binding(value.request),
                value.frame.capturedAt,
                value.frame.digest,
                value.fence.digest,
                value.journalDigest,
            ]),
        )
        .digest('hex');
}
export const recoveryQuiescenceSchema = base.refine((value) => {
    try {
        const frame = parseUsageReceiptResponse(value.request.receipt, value.frame);
        return (
            'stats' in frame &&
            frame.stats.length === 0 &&
            value.request.retainedDigest === null &&
            value.frame.coreProcessId === value.request.coreProcessId &&
            value.fence.state === 'FENCED' &&
            value.fence.generation === value.request.generation &&
            value.fence.digest === value.request.previous &&
            value.digest === checksum(value)
        );
    } catch {
        return false;
    }
});

export function recoveryQuiescenceMatches(request: RecoveryUsageSampleRequest, value: unknown) {
    const parsed = recoveryQuiescenceSchema.safeParse(value);
    return (
        parsed.success &&
        JSON.stringify(binding(parsed.data.request)) === JSON.stringify(binding(request))
    );
}

export const recoveryQuiescenceReplySchema = z.strictObject({
    witness: recoveryQuiescenceSchema.nullable(),
    journal: recoveryUsageAckReply.shape.journal,
});
export type RecoveryQuiescenceReply = z.infer<typeof recoveryQuiescenceReplySchema>;
export function recoveryQuiescenceReplyMatches(
    request: RecoveryUsageSampleRequest,
    value: unknown,
): value is RecoveryQuiescenceReply {
    const parsed = recoveryQuiescenceReplySchema.safeParse(value);
    if (!parsed.success || parsed.data.journal.stream !== request.instance) return false;
    const { witness, journal } = parsed.data;
    if (!witness) return true;
    if (!recoveryQuiescenceMatches(request, witness)) return false;
    if (journal.pending)
        return (
            journal.acked === request.prior.sequence &&
            journal.ackDigest === request.prior.digest &&
            journal.digest === witness.journalDigest &&
            journal.pending.sequence === witness.frame.sequence &&
            journal.pending.coreProcessId === witness.frame.coreProcessId &&
            journal.pending.digest === witness.frame.digest
        );
    return journal.acked === witness.frame.sequence && journal.ackDigest === witness.frame.digest;
}
// This checks one reply, not recovery readiness. Callers must obtain it live
// and revalidate the current SQL ticket, financial decision and native fence.
export function recoveryQuiescenceAcknowledged(
    request: RecoveryUsageSampleRequest,
    value: unknown,
) {
    return (
        recoveryQuiescenceReplyMatches(request, value) &&
        value.witness !== null &&
        value.journal.pending === null
    );
}

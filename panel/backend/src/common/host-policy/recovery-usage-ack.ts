import { z } from 'zod';

import { recoveryFenceSchema } from './quota-recovery-fence';
import { recoveryPolicyRequestSchema } from './quota-recovery-policy';
import { usageReceiptRequest } from './usage-receipt';

export const RECOVERY_USAGE_ACK = 'remnacust-recovery-usage-ack-v1';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const base = recoveryPolicyRequestSchema.omit({ policyRevision: true });
export const recoveryUsageAckRequest = base
    .extend({
        decisionDigest: digest,
        sourceDigest: digest,
        receipt: usageReceiptRequest.options[1],
    })
    .refine((value) => value.receipt.stream === value.instance);
export type RecoveryUsageAckRequest = z.infer<typeof recoveryUsageAckRequest>;
export const recoveryUsageAckReply = z.strictObject({
    version: z.literal(RECOVERY_USAGE_ACK),
    requestId: base.shape.requestId,
    generation: base.shape.generation,
    coreProcessId: base.shape.coreProcessId,
    instance: base.shape.instance,
    previous: digest,
    decisionDigest: digest,
    sourceDigest: digest,
    alreadyAcknowledged: z.boolean(),
    acknowledgement: z.strictObject({
        stream: base.shape.instance,
        sequence: usageReceiptRequest.options[1].shape.sequence,
        acknowledged: z.literal(true),
    }),
    journal: z.strictObject({
        stream: base.shape.instance,
        acked: usageReceiptRequest.options[1].shape.sequence,
        ackDigest: digest,
        digest,
        pending: z
            .strictObject({
                sequence: usageReceiptRequest.options[1].shape.sequence,
                coreProcessId: base.shape.coreProcessId,
                digest,
            })
            .nullable(),
    }),
    recovery: recoveryFenceSchema,
});

export type RecoveryUsageAckReply = z.infer<typeof recoveryUsageAckReply>;
export function recoveryUsageAckMatches(
    request: RecoveryUsageAckRequest,
    value: unknown,
): value is RecoveryUsageAckReply {
    const parsed = recoveryUsageAckReply.safeParse(value);
    if (!parsed.success) return false;
    const reply = parsed.data;
    return (
        reply.requestId === request.requestId &&
        reply.generation === request.generation &&
        reply.coreProcessId === request.coreProcessId &&
        reply.instance === request.instance &&
        reply.previous === request.previous &&
        reply.decisionDigest === request.decisionDigest &&
        reply.sourceDigest === request.sourceDigest &&
        reply.acknowledgement.stream === request.instance &&
        reply.acknowledgement.sequence === request.receipt.sequence &&
        reply.journal.stream === request.instance &&
        reply.journal.acked === request.receipt.sequence &&
        reply.journal.ackDigest === request.receipt.digest &&
        (!reply.journal.pending ||
            BigInt(reply.journal.pending.sequence) === BigInt(request.receipt.sequence) + 1n) &&
        reply.recovery.state === 'FENCED' &&
        reply.recovery.generation === request.generation &&
        reply.recovery.digest === request.previous
    );
}

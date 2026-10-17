import { z } from 'zod';

import { recoveryFenceSchema } from './quota-recovery-fence';
import { recoveryPolicyRequestSchema } from './quota-recovery-policy';
import { parseUsageReceiptResponse, sampleResponse, usageReceiptRequest } from './usage-receipt';

export const RECOVERY_USAGE_SAMPLE = 'remnacust-recovery-usage-sample-v1';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const base = recoveryPolicyRequestSchema.omit({ policyRevision: true });
export const recoveryUsageSampleRequest = base
    .extend({
        preparationDigest: digest,
        sourceDigest: digest,
        retainedDigest: digest.nullable(),
        prior: z.strictObject({ sequence: usageReceiptRequest.options[0].shape.sequence, digest }),
        receipt: usageReceiptRequest.options[0],
    })
    .refine(
        (value) =>
            value.receipt.stream === value.instance &&
            BigInt(value.receipt.sequence) === BigInt(value.prior.sequence) + 1n,
    );
export type RecoveryUsageSampleRequest = z.infer<typeof recoveryUsageSampleRequest>;
export const recoveryUsageSampleReply = z.strictObject({
    version: z.literal(RECOVERY_USAGE_SAMPLE),
    requestId: base.shape.requestId,
    generation: base.shape.generation,
    coreProcessId: base.shape.coreProcessId,
    instance: base.shape.instance,
    previous: digest,
    preparationDigest: digest,
    sourceDigest: digest,
    retainedDigest: digest.nullable(),
    alreadyCaptured: z.boolean(),
    journalDigest: digest,
    frame: sampleResponse,
    recovery: recoveryFenceSchema,
});
export type RecoveryUsageSampleReply = z.infer<typeof recoveryUsageSampleReply>;
export function recoveryUsageSampleMatches(
    request: RecoveryUsageSampleRequest,
    value: unknown,
): value is RecoveryUsageSampleReply {
    const parsed = recoveryUsageSampleReply.safeParse(value);
    if (!parsed.success) return false;
    const reply = parsed.data;
    if (
        reply.requestId !== request.requestId ||
        reply.generation !== request.generation ||
        reply.coreProcessId !== request.coreProcessId ||
        reply.instance !== request.instance ||
        reply.previous !== request.previous ||
        reply.preparationDigest !== request.preparationDigest ||
        reply.sourceDigest !== request.sourceDigest ||
        reply.retainedDigest !== request.retainedDigest ||
        reply.recovery.state !== 'FENCED' ||
        reply.recovery.generation !== request.generation ||
        reply.recovery.digest !== request.previous ||
        (request.retainedDigest !== null &&
            (!reply.alreadyCaptured || reply.frame.digest !== request.retainedDigest))
    )
        return false;
    try {
        parseUsageReceiptResponse(request.receipt, reply.frame);
        return true;
    } catch {
        return false;
    }
}

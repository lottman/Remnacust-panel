import { z } from 'zod';

import {
    recoveryFenceSchema,
    recoveryFenceStateSchema,
    type RecoveryFence,
} from './quota-recovery-fence';
import { recoveryPolicyRequestSchema } from './quota-recovery-policy';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const recoveryReleaseRequestSchema = recoveryPolicyRequestSchema.extend({
    policyGeneration: recoveryPolicyRequestSchema.shape.generation,
    witnessDigest: digest,
    journalDigest: digest,
});
export type RecoveryReleaseRequest = z.infer<typeof recoveryReleaseRequestSchema>;
export const recoveryReleaseReplySchema = z.strictObject({
    requestId: recoveryPolicyRequestSchema.shape.requestId,
    generation: recoveryPolicyRequestSchema.shape.generation,
    coreProcessId: recoveryPolicyRequestSchema.shape.coreProcessId,
    instance: recoveryPolicyRequestSchema.shape.instance,
    policyRevision: recoveryPolicyRequestSchema.shape.policyRevision,
    policyGeneration: recoveryPolicyRequestSchema.shape.generation,
    witnessDigest: digest,
    journalDigest: digest,
    quotaRecovery: recoveryFenceStateSchema,
});
export type RecoveryReleaseReply = z.infer<typeof recoveryReleaseReplySchema>;
export function recoveryReleaseReplyMatches(
    request: RecoveryReleaseRequest,
    previous: RecoveryFence,
    value: unknown,
): value is RecoveryReleaseReply {
    const prior = recoveryFenceSchema.safeParse(previous),
        input = recoveryReleaseRequestSchema.safeParse(request),
        reply = recoveryReleaseReplySchema.safeParse(value);
    if (
        !prior.success ||
        !input.success ||
        !reply.success ||
        prior.data.state !== 'FENCED' ||
        prior.data.digest !== input.data.previous ||
        prior.data.generation !== input.data.generation
    )
        return false;
    const result = reply.data,
        record = result.quotaRecovery.record;
    return (
        Object.entries(input.data).every(
            ([key, value]) =>
                key === 'previous' || result[key as keyof RecoveryReleaseReply] === value,
        ) &&
        record?.state === 'RELEASED' &&
        record.token === input.data.requestId &&
        record.generation === input.data.generation &&
        record.previous === prior.data.digest &&
        record.sequence === (BigInt(prior.data.sequence) + 1n).toString()
    );
}

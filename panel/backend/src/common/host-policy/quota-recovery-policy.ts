import { z } from 'zod';

import { recoveryFenceStateSchema } from './quota-recovery-fence';

const uuid = z
    .uuid()
    .refine((value) => value === value.toLowerCase() && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value));
export const recoveryPolicyRequestSchema = z.strictObject({
    requestId: uuid,
    generation: uuid,
    coreProcessId: uuid,
    instance: uuid,
    previous: z.string().regex(/^[a-f0-9]{64}$/),
    policyRevision: z
        .string()
        .regex(/^[1-9][0-9]{0,18}$/)
        .refine((value) => BigInt(value) <= 9223372036854775807n),
});
export type RecoveryPolicyRequest = z.infer<typeof recoveryPolicyRequestSchema>;
export const recoveryPolicyReplySchema = z.strictObject({
    requestId: uuid,
    coreProcessId: uuid,
    instance: uuid,
    policyRevision: recoveryPolicyRequestSchema.shape.policyRevision,
    policyGeneration: uuid,
    quotaRecovery: recoveryFenceStateSchema,
});
export type RecoveryPolicyReply = z.infer<typeof recoveryPolicyReplySchema>;

export function recoveryPolicyReplyMatches(
    request: RecoveryPolicyRequest,
    response: unknown,
): response is RecoveryPolicyReply {
    const parsed = recoveryPolicyReplySchema.safeParse(response);
    if (!parsed.success) return false;
    const reply = parsed.data;
    const fence = reply.quotaRecovery.record;
    return (
        reply.requestId === request.requestId &&
        reply.coreProcessId === request.coreProcessId &&
        reply.instance === request.instance &&
        reply.policyRevision === request.policyRevision &&
        fence?.state === 'FENCED' &&
        fence.generation === request.generation &&
        fence.digest === request.previous
    );
}

export const RECOVERY_POLICY_PROOF_HEADER = 'x-remnacust-recovery-proof';
const recoveryPolicyTransportSchema = z.strictObject({
    generation: uuid,
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    coreProcessId: uuid,
    instance: uuid,
});
export function parseRecoveryPolicyTransportProof(value: unknown) {
    if (typeof value !== 'string' || value.length > 256)
        throw new Error('Invalid recovery policy transport proof');
    const parts = value.split(':');
    if (parts.length !== 5 || parts[0] !== 'v1')
        throw new Error('Invalid recovery policy transport proof');
    return recoveryPolicyTransportSchema.parse({
        generation: parts[1],
        digest: parts[2],
        coreProcessId: parts[3],
        instance: parts[4],
    });
}
export function recoveryPolicyTransportProof(status: {
    quotaRecoveryPolicyBindingsRequired?: boolean;
    quotaRecoveryPolicyBindingsSupported?: boolean;
    quotaRecovery?: unknown;
    coreProcessId?: string | null;
    quotaInstanceId?: string | null;
}): string | undefined {
    const state =
        status.quotaRecovery == null ? null : recoveryFenceStateSchema.parse(status.quotaRecovery);
    const record = state?.record;
    if (!record) {
        if (status.quotaRecoveryPolicyBindingsRequired)
            throw new Error('Recovery policy state cannot be verified');
        return undefined;
    }
    if (record.state !== 'RELEASED') throw new Error('Recovery is paused');
    if (status.quotaRecoveryPolicyBindingsSupported !== true)
        throw new Error('Update Node: recovery policy binding is not supported');
    const proof = recoveryPolicyTransportSchema.parse({
        generation: record.generation,
        digest: record.digest,
        coreProcessId: status.coreProcessId,
        instance: status.quotaInstanceId,
    });
    return ['v1', proof.generation, proof.digest, proof.coreProcessId, proof.instance].join(':');
}

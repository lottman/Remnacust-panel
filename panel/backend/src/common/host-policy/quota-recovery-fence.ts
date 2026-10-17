import { createHash } from 'node:crypto';
import { z } from 'zod';

export const QUOTA_RECOVERY_FENCE = 'remnacust-quota-recovery-fence-v1';
const uuid = z
    .uuid()
    .refine(
        (value) =>
            value === value.toLowerCase() && value !== '00000000-0000-0000-0000-000000000000',
    );
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const record = z.strictObject({
    version: z.literal(QUOTA_RECOVERY_FENCE),
    generation: uuid,
    token: uuid,
    state: z.enum(['FENCED', 'RELEASED']),
    sequence: z
        .string()
        .regex(/^[1-9][0-9]{0,18}$/)
        .refine((value) => BigInt(value) <= 9223372036854775807n),
    previous: digest.nullable(),
    digest,
});
export const recoveryFenceSchema = record.refine((value) => {
    const hash = createHash('sha256')
        .update(
            [
                value.version,
                value.generation,
                value.token,
                value.state,
                value.sequence,
                value.previous ?? '-',
                '',
            ].join('\n'),
        )
        .digest('hex');
    return (
        hash === value.digest &&
        (value.sequence === '1') === (value.previous === null) &&
        !(value.state === 'RELEASED' && value.sequence === '1')
    );
});
export const recoveryFenceStateSchema = z.strictObject({
    version: z.literal(QUOTA_RECOVERY_FENCE),
    record: recoveryFenceSchema.nullable(),
});
export type RecoveryFence = z.infer<typeof record>;

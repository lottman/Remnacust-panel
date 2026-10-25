import { z } from 'zod';

const uuid = z.uuid().transform((value) => value.toLowerCase());
export const PortPlanRevisionSchema = z
    .string()
    .regex(/^(0|[1-9][0-9]{0,18})$/)
    .refine(
        (value) => /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= 9223372036854775807n,
    );
const common = {
    expectedRevision: PortPlanRevisionSchema,
    requestId: uuid.optional(),
    reviewHash: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
};
export const NodePortBindingInputSchema = z.strictObject({
    uuid,
    configProfileUuid: uuid,
    configProfileInboundUuid: uuid,
    listenAddress: z.string().min(1).max(64),
    port: z.number().int().min(1).max(65535),
});
export const NodePortPlanInputSchema = z.discriminatedUnion('enabled', [
    z.strictObject({
        ...common,
        enabled: z.literal(true),
        bindings: z.array(NodePortBindingInputSchema).min(1).max(512),
    }),
    z.strictObject({
        ...common,
        enabled: z.literal(false),
        profileUuid: uuid,
        activeInbounds: z.array(uuid).min(1).max(512),
    }),
]);
export type NodePortPlanInput = z.infer<typeof NodePortPlanInputSchema>;

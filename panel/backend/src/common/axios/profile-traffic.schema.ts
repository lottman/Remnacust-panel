import { z } from 'zod';

const counter = z.string().refine(value =>
    /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= 9223372036854775807n,
    'Invalid profile traffic counter');

export const ProfileTrafficSchema = z.object({
    capability: z.literal('remnacust-profile-traffic-v1'),
    coreProcessId: z.uuid(),
    capturedAt: z.iso.datetime(),
    bindings: z.array(z.object({
        bindingUuid: z.uuid(),
        uplink: counter,
        downlink: counter,
        available: z.boolean(),
        retired: z.boolean(),
    })).max(1024),
}).superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [index, binding] of value.bindings.entries()) {
        if (seen.has(binding.bindingUuid))
            ctx.addIssue({ code: 'custom', message: 'Duplicate traffic binding', path: ['bindings', index, 'bindingUuid'] });
        seen.add(binding.bindingUuid);
    }
});

export type ProfileTrafficSnapshot = z.infer<typeof ProfileTrafficSchema>;

export const nodeBindingTrafficKey = (nodeUuid: string) => `node-binding-traffic:${nodeUuid}`;

// A cached transport observation cannot authorize or settle a quota reserve.
export function parseProfileTraffic(value: unknown): ProfileTrafficSnapshot | null {
    const result = ProfileTrafficSchema.safeParse(value);
    if (!result.success) return null;
    const age = Date.now() - Date.parse(result.data.capturedAt);
    return age >= -30_000 && age <= 120_000 ? result.data : null;
}

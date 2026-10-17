import { z } from 'zod';
export declare const ProfileTrafficSchema: z.ZodObject<{
    capability: z.ZodLiteral<"remnacust-profile-traffic-v1">;
    coreProcessId: z.ZodUUID;
    capturedAt: z.ZodISODateTime;
    bindings: z.ZodArray<z.ZodObject<{
        bindingUuid: z.ZodUUID;
        uplink: z.ZodString;
        downlink: z.ZodString;
        available: z.ZodBoolean;
        retired: z.ZodBoolean;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ProfileTrafficSnapshot = z.infer<typeof ProfileTrafficSchema>;
//# sourceMappingURL=profile-traffic.schema.d.ts.map
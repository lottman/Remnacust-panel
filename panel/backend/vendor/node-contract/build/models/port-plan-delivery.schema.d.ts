import { z } from 'zod';
export declare const PortPlanCounterSchema: z.ZodString;
export declare const PortPlanDeliverySchema: z.ZodObject<{
    epoch: z.ZodString;
    owner: z.ZodUUID;
}, z.core.$strip>;
export declare const PortPlanTargetSchema: z.ZodObject<{
    revision: z.ZodString;
    enabled: z.ZodBoolean;
    delivery: z.ZodOptional<z.ZodObject<{
        epoch: z.ZodString;
        owner: z.ZodUUID;
    }, z.core.$strip>>;
}, z.core.$strip>;
//# sourceMappingURL=port-plan-delivery.schema.d.ts.map
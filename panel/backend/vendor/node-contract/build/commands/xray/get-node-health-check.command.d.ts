import { z } from 'zod';
export declare namespace GetNodeHealthCheckCommand {
    const url: "/node/xray/healthcheck";
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            isAlive: z.ZodBoolean;
            xrayInternalStatusCached: z.ZodBoolean;
            xrayVersion: z.ZodNullable<z.ZodString>;
            nodeVersion: z.ZodString;
            nativePortPlansSupported: z.ZodOptional<z.ZodBoolean>;
            profileGraphDeliverySupported: z.ZodOptional<z.ZodBoolean>;
            portPlanStateSupported: z.ZodOptional<z.ZodBoolean>;
            portPlanDeliverySupported: z.ZodOptional<z.ZodBoolean>;
            portPlanDeliveryCapability: z.ZodOptional<z.ZodLiteral<"remnacust-port-plan-delivery-v2">>;
            portPlanDeliveryEpoch: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-node-health-check.command.d.ts.map
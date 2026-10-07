import { z } from 'zod';
export declare namespace CollectReportsCommand {
    const url: "/node/plugin/torrent-blocker/collect";
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            reports: z.ZodArray<z.ZodObject<{
                actionReport: z.ZodObject<{
                    blocked: z.ZodBoolean;
                    ip: z.ZodString;
                    blockDuration: z.ZodNumber;
                    willUnblockAt: z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>;
                    userId: z.ZodString;
                    processedAt: z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>;
                }, z.core.$strip>;
                xrayReport: z.ZodObject<{
                    email: z.ZodNullable<z.ZodString>;
                    level: z.ZodNullable<z.ZodNumber>;
                    protocol: z.ZodNullable<z.ZodString>;
                    network: z.ZodString;
                    source: z.ZodNullable<z.ZodString>;
                    destination: z.ZodString;
                    routeTarget: z.ZodNullable<z.ZodString>;
                    originalTarget: z.ZodNullable<z.ZodString>;
                    inboundTag: z.ZodNullable<z.ZodString>;
                    inboundName: z.ZodNullable<z.ZodString>;
                    inboundLocal: z.ZodNullable<z.ZodString>;
                    outboundTag: z.ZodNullable<z.ZodString>;
                    ts: z.ZodNumber;
                }, z.core.$strip>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=collect-reports.schema.d.ts.map
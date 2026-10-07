import { z } from 'zod';
export declare namespace GetCombinedStatsCommand {
    const url: "/node/stats/get-combined-stats";
    const RequestSchema: z.ZodObject<{
        reset: z.ZodBoolean;
    }, z.core.$strip>;
    type Request = z.infer<typeof RequestSchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            inbounds: z.ZodArray<z.ZodObject<{
                inbound: z.ZodString;
                downlink: z.ZodNumber;
                uplink: z.ZodNumber;
            }, z.core.$strip>>;
            outbounds: z.ZodArray<z.ZodObject<{
                outbound: z.ZodString;
                downlink: z.ZodNumber;
                uplink: z.ZodNumber;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-combined-stats.command.d.ts.map
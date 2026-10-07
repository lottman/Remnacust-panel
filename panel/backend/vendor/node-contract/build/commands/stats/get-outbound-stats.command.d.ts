import { z } from 'zod';
export declare namespace GetOutboundStatsCommand {
    const url: "/node/stats/get-outbound-stats";
    const RequestSchema: z.ZodObject<{
        tag: z.ZodString;
        reset: z.ZodBoolean;
    }, z.core.$strip>;
    type Request = z.infer<typeof RequestSchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            outbound: z.ZodString;
            downlink: z.ZodNumber;
            uplink: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-outbound-stats.command.d.ts.map
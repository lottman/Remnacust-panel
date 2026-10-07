import { z } from 'zod';
export declare namespace GetInboundStatsCommand {
    const url: "/node/stats/get-inbound-stats";
    const RequestSchema: z.ZodObject<{
        tag: z.ZodString;
        reset: z.ZodBoolean;
    }, z.core.$strip>;
    type Request = z.infer<typeof RequestSchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            inbound: z.ZodString;
            downlink: z.ZodNumber;
            uplink: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-inbound-stats.command.d.ts.map
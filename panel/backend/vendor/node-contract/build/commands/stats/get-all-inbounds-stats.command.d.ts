import { z } from 'zod';
export declare namespace GetAllInboundsStatsCommand {
    const url: "/node/stats/get-all-inbounds-stats";
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
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-all-inbounds-stats.command.d.ts.map
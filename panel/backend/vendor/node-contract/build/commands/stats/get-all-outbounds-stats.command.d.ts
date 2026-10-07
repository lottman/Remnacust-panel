import { z } from 'zod';
export declare namespace GetAllOutboundsStatsCommand {
    const url: "/node/stats/get-all-outbounds-stats";
    const RequestSchema: z.ZodObject<{
        reset: z.ZodBoolean;
    }, z.core.$strip>;
    type Request = z.infer<typeof RequestSchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            outbounds: z.ZodArray<z.ZodObject<{
                outbound: z.ZodString;
                downlink: z.ZodNumber;
                uplink: z.ZodNumber;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-all-outbounds-stats.command.d.ts.map
import { z } from 'zod';
export declare namespace GetUsersStatsCommand {
    const url: "/node/stats/get-users-stats";
    const RequestSchema: z.ZodObject<{
        reset: z.ZodBoolean;
    }, z.core.$strip>;
    type Request = z.infer<typeof RequestSchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            users: z.ZodArray<z.ZodObject<{
                username: z.ZodString;
                downlink: z.ZodNumber;
                uplink: z.ZodNumber;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-users-stats.command.d.ts.map
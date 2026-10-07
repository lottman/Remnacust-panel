import { z } from 'zod';
export declare namespace GetUserOnlineStatusCommand {
    const url: "/node/stats/get-user-online-status";
    const RequestSchema: z.ZodObject<{
        username: z.ZodString;
    }, z.core.$strip>;
    type Request = z.infer<typeof RequestSchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            isOnline: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-user-online-status.command.d.ts.map
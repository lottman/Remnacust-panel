import { z } from 'zod';
export declare namespace DropUsersConnectionsCommand {
    const url: "/node/handler/drop-users-connections";
    const RequestSchema: z.ZodObject<{
        userIds: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    type Request = z.infer<typeof RequestSchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            success: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=drop-users-connections.command.d.ts.map
import { z } from 'zod';
export declare namespace RemoveUsersCommand {
    const url: "/node/handler/remove-users";
    const RequestSchema: z.ZodObject<{
        users: z.ZodArray<z.ZodObject<{
            userId: z.ZodString;
            hashUuid: z.ZodUUID;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    type Request = z.infer<typeof RequestSchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            success: z.ZodBoolean;
            error: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=remove-users.command.d.ts.map
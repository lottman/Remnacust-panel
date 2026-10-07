import { z } from 'zod';
export declare namespace RemoveUserCommand {
    const url: "/node/handler/remove-user";
    const RequestSchema: z.ZodObject<{
        username: z.ZodString;
        hashData: z.ZodObject<{
            vlessUuid: z.ZodUUID;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Request = z.infer<typeof RequestSchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            success: z.ZodBoolean;
            error: z.ZodNullable<z.ZodString>;
            deviceRevocationSupported: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=remove-user.command.d.ts.map
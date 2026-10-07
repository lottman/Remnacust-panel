import { z } from 'zod';
export declare namespace SyncCommand {
    const url: "/node/plugin/sync";
    const RequestSchema: z.ZodObject<{
        plugin: z.ZodNullable<z.ZodObject<{
            config: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            uuid: z.ZodUUID;
            name: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    type Request = z.infer<typeof RequestSchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            accepted: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=sync.command.d.ts.map
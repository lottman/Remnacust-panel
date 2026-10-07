import { z } from 'zod';
export declare namespace SendBackupCommand {
    const url: "/api/backups/send";
    const TSQ_url: "/api/backups/send";
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestBodySchema: z.ZodObject<{
        filename: z.ZodString;
    }, z.core.$strip>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            delivered: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type RequestBody = z.infer<typeof RequestBodySchema>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=send-backup.command.d.ts.map
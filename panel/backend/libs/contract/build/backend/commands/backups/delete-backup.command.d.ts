import { z } from 'zod';
export declare namespace DeleteBackupCommand {
    const url: "/api/backups/delete";
    const TSQ_url: "/api/backups/delete";
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestBodySchema: z.ZodObject<{
        filename: z.ZodString;
    }, z.core.$strip>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            backups: z.ZodArray<z.ZodObject<{
                filename: z.ZodString;
                sizeBytes: z.ZodNumber;
                createdAt: z.ZodPipe<z.ZodISODateTime, z.ZodTransform<Date, string>>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type RequestBody = z.infer<typeof RequestBodySchema>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=delete-backup.command.d.ts.map
import { z } from 'zod';
export declare namespace CreateBackupCommand {
    const url: "/api/backups/create";
    const TSQ_url: "/api/backups/create";
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestBodySchema: z.ZodObject<{}, z.core.$strip>;
    type RequestBody = z.infer<typeof RequestBodySchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            filename: z.ZodString;
            sizeBytes: z.ZodNumber;
            createdAt: z.ZodPipe<z.ZodISODateTime, z.ZodTransform<Date, string>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=create-backup.command.d.ts.map
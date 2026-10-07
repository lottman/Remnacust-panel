import { z } from 'zod';
export declare namespace GetBackupsCommand {
    const url: "/api/backups";
    const TSQ_url: "/api/backups";
    const endpointDetails: import("../../constants").EndpointDetails;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            backups: z.ZodArray<z.ZodObject<{
                filename: z.ZodString;
                sizeBytes: z.ZodNumber;
                createdAt: z.ZodPipe<z.ZodISODateTime, z.ZodTransform<Date, string>>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-backups.command.d.ts.map
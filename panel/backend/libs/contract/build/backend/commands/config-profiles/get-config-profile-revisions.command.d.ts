import { z } from 'zod';
export declare namespace GetConfigProfileRevisionsCommand {
    const url: (uuid: string) => string;
    const TSQ_url: string;
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestParamSchema: z.ZodObject<{
        uuid: z.ZodUUID;
    }, z.core.$strip>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodArray<z.ZodObject<{
            uuid: z.ZodUUID;
            name: z.ZodString;
            config: z.ZodUnknown;
            createdAt: z.ZodISODateTime;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    type RequestParam = z.infer<typeof RequestParamSchema>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-config-profile-revisions.command.d.ts.map
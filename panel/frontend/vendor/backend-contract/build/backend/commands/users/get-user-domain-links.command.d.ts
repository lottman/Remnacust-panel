import { z } from 'zod';
export declare namespace GetUserDomainLinksCommand {
    const url: (userId: string) => string;
    const TSQ_url: string;
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestParamSchema: z.ZodObject<{
        userId: z.ZodCoercedNumber<unknown>;
    }, z.core.$strip>;
    const RequestQuerySchema: z.ZodObject<{
        domainUuid: z.ZodOptional<z.ZodUUID>;
        kind: z.ZodOptional<z.ZodEnum<{
            PRIMARY: "PRIMARY";
            CDN: "CDN";
        }>>;
    }, z.core.$strict>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            primaryDomainUuid: z.ZodUUID;
            links: z.ZodArray<z.ZodObject<{
                domainUuid: z.ZodUUID;
                name: z.ZodString;
                domain: z.ZodString;
                kind: z.ZodEnum<{
                    PRIMARY: "PRIMARY";
                    CDN: "CDN";
                }>;
                url: z.ZodURL;
                isSelected: z.ZodBoolean;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type RequestParam = z.infer<typeof RequestParamSchema>;
    type RequestQuery = z.infer<typeof RequestQuerySchema>;
    type Response = z.infer<typeof ResponseSchema>;
}
export declare namespace GetUserPrimaryDomainLinkCommand {
    const url: (userId: string) => string;
    const TSQ_url: string;
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestParamSchema: z.ZodObject<{
        userId: z.ZodCoercedNumber<unknown>;
    }, z.core.$strip>;
    const RequestQuerySchema: z.ZodObject<{
        domainUuid: z.ZodOptional<z.ZodUUID>;
    }, z.core.$strict>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            primaryDomainUuid: z.ZodUUID;
            links: z.ZodArray<z.ZodObject<{
                domainUuid: z.ZodUUID;
                name: z.ZodString;
                domain: z.ZodString;
                kind: z.ZodEnum<{
                    PRIMARY: "PRIMARY";
                    CDN: "CDN";
                }>;
                url: z.ZodURL;
                isSelected: z.ZodBoolean;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type RequestQuery = z.infer<typeof RequestQuerySchema>;
    type RequestParam = z.infer<typeof RequestParamSchema>;
    type Response = z.infer<typeof ResponseSchema>;
}
export declare namespace GetUserCdnDomainLinksCommand {
    const url: (userId: string) => string;
    const TSQ_url: string;
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestParamSchema: z.ZodObject<{
        userId: z.ZodCoercedNumber<unknown>;
    }, z.core.$strip>;
    const RequestQuerySchema: z.ZodObject<{
        domainUuid: z.ZodOptional<z.ZodUUID>;
    }, z.core.$strict>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            primaryDomainUuid: z.ZodUUID;
            links: z.ZodArray<z.ZodObject<{
                domainUuid: z.ZodUUID;
                name: z.ZodString;
                domain: z.ZodString;
                kind: z.ZodEnum<{
                    PRIMARY: "PRIMARY";
                    CDN: "CDN";
                }>;
                url: z.ZodURL;
                isSelected: z.ZodBoolean;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type RequestQuery = z.infer<typeof RequestQuerySchema>;
    type RequestParam = z.infer<typeof RequestParamSchema>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-user-domain-links.command.d.ts.map
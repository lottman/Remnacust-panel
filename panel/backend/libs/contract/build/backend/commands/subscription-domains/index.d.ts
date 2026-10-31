import { z } from 'zod';
export declare namespace ListSubscriptionDomainsCommand {
    const url: "/api/subscription-domains/";
    const TSQ_url: "/api/subscription-domains/";
    const endpointDetails: import("../../constants").EndpointDetails;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodArray<z.ZodObject<{
            uuid: z.ZodUUID;
            name: z.ZodString;
            domain: z.ZodString;
            path: z.ZodString;
            kind: z.ZodEnum<{
                PRIMARY: "PRIMARY";
                CDN: "CDN";
            }>;
            parentUuid: z.ZodNullable<z.ZodUUID>;
            isDefault: z.ZodBoolean;
            usersCount: z.ZodNumber;
            aliasesCount: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}
export declare namespace GetSubscriptionDomainCommand {
    const url: string;
    const TSQ_url: string;
    const endpointDetails: import("../../constants").EndpointDetails;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            uuid: z.ZodUUID;
            name: z.ZodString;
            domain: z.ZodString;
            path: z.ZodString;
            kind: z.ZodEnum<{
                PRIMARY: "PRIMARY";
                CDN: "CDN";
            }>;
            parentUuid: z.ZodNullable<z.ZodUUID>;
            isDefault: z.ZodBoolean;
            usersCount: z.ZodNumber;
            aliasesCount: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
}
export declare namespace CreateSubscriptionDomainCommand {
    const url: "/api/subscription-domains/";
    const TSQ_url: "/api/subscription-domains/";
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestBodySchema: z.ZodObject<{
        name: z.ZodString;
        domain: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
        path: z.ZodPipe<z.ZodDefault<z.ZodString>, z.ZodTransform<string, string>>;
        kind: z.ZodEnum<{
            PRIMARY: "PRIMARY";
            CDN: "CDN";
        }>;
        parentUuid: z.ZodDefault<z.ZodNullable<z.ZodUUID>>;
        isDefault: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            uuid: z.ZodUUID;
            name: z.ZodString;
            domain: z.ZodString;
            path: z.ZodString;
            kind: z.ZodEnum<{
                PRIMARY: "PRIMARY";
                CDN: "CDN";
            }>;
            parentUuid: z.ZodNullable<z.ZodUUID>;
            isDefault: z.ZodBoolean;
            usersCount: z.ZodNumber;
            aliasesCount: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
}
export declare namespace UpdateSubscriptionDomainCommand {
    const url: string;
    const TSQ_url: string;
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestBodySchema: z.ZodObject<{
        name: z.ZodString;
        domain: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
        path: z.ZodPipe<z.ZodDefault<z.ZodString>, z.ZodTransform<string, string>>;
        kind: z.ZodEnum<{
            PRIMARY: "PRIMARY";
            CDN: "CDN";
        }>;
        parentUuid: z.ZodDefault<z.ZodNullable<z.ZodUUID>>;
        isDefault: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            uuid: z.ZodUUID;
            name: z.ZodString;
            domain: z.ZodString;
            path: z.ZodString;
            kind: z.ZodEnum<{
                PRIMARY: "PRIMARY";
                CDN: "CDN";
            }>;
            parentUuid: z.ZodNullable<z.ZodUUID>;
            isDefault: z.ZodBoolean;
            usersCount: z.ZodNumber;
            aliasesCount: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
}
export declare namespace DeleteSubscriptionDomainCommand {
    const url: string;
    const TSQ_url: string;
    const endpointDetails: import("../../constants").EndpointDetails;
}
//# sourceMappingURL=index.d.ts.map
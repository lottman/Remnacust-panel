import { z } from 'zod';
export declare namespace ListSubscriptionDomainsCommand {
    const url: "/api/subscription-domains/";
    const TSQ_url: "/api/subscription-domains/";
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestQuerySchema: z.ZodObject<{
        kind: z.ZodOptional<z.ZodEnum<{
            PRIMARY: "PRIMARY";
            CDN: "CDN";
        }>>;
        parentUuid: z.ZodOptional<z.ZodUUID>;
    }, z.core.$strict>;
    type RequestQuery = z.infer<typeof RequestQuerySchema>;
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
            accessMode: z.ZodEnum<{
                BLOCKED: "BLOCKED";
                OPEN: "OPEN";
                CDN_ONLY: "CDN_ONLY";
                REDIRECT: "REDIRECT";
            }>;
            redirectDomainUuid: z.ZodNullable<z.ZodUUID>;
            usersCount: z.ZodNumber;
            aliasesCount: z.ZodNumber;
            publicBaseUrl: z.ZodString;
            requestHeaderName: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        environment: z.ZodOptional<z.ZodEnum<{
            unavailable: "unavailable";
            synced: "synced";
            invalid: "invalid";
            conflict: "conflict";
        }>>;
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
            accessMode: z.ZodEnum<{
                BLOCKED: "BLOCKED";
                OPEN: "OPEN";
                CDN_ONLY: "CDN_ONLY";
                REDIRECT: "REDIRECT";
            }>;
            redirectDomainUuid: z.ZodNullable<z.ZodUUID>;
            usersCount: z.ZodNumber;
            aliasesCount: z.ZodNumber;
            publicBaseUrl: z.ZodString;
            requestHeaderName: z.ZodNullable<z.ZodString>;
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
        accessMode: z.ZodOptional<z.ZodEnum<{
            BLOCKED: "BLOCKED";
            OPEN: "OPEN";
            CDN_ONLY: "CDN_ONLY";
            REDIRECT: "REDIRECT";
        }>>;
        redirectDomainUuid: z.ZodOptional<z.ZodNullable<z.ZodUUID>>;
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
            accessMode: z.ZodEnum<{
                BLOCKED: "BLOCKED";
                OPEN: "OPEN";
                CDN_ONLY: "CDN_ONLY";
                REDIRECT: "REDIRECT";
            }>;
            redirectDomainUuid: z.ZodNullable<z.ZodUUID>;
            usersCount: z.ZodNumber;
            aliasesCount: z.ZodNumber;
            publicBaseUrl: z.ZodString;
            requestHeaderName: z.ZodNullable<z.ZodString>;
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
        accessMode: z.ZodOptional<z.ZodEnum<{
            BLOCKED: "BLOCKED";
            OPEN: "OPEN";
            CDN_ONLY: "CDN_ONLY";
            REDIRECT: "REDIRECT";
        }>>;
        redirectDomainUuid: z.ZodOptional<z.ZodNullable<z.ZodUUID>>;
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
            accessMode: z.ZodEnum<{
                BLOCKED: "BLOCKED";
                OPEN: "OPEN";
                CDN_ONLY: "CDN_ONLY";
                REDIRECT: "REDIRECT";
            }>;
            redirectDomainUuid: z.ZodNullable<z.ZodUUID>;
            usersCount: z.ZodNumber;
            aliasesCount: z.ZodNumber;
            publicBaseUrl: z.ZodString;
            requestHeaderName: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>;
}
export declare namespace DeleteSubscriptionDomainCommand {
    const url: string;
    const TSQ_url: string;
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestQuerySchema: z.ZodObject<{
        reassignUsers: z.ZodOptional<z.ZodPipe<z.ZodEnum<{
            true: "true";
            false: "false";
        }>, z.ZodTransform<boolean, "true" | "false">>>;
    }, z.core.$strict>;
    type RequestQuery = z.infer<typeof RequestQuerySchema>;
}
export declare namespace GetSubscriptionDomainCredentialsCommand {
    const url = "/api/subscription-domains/:uuid/credentials";
    const TSQ_url = "/api/subscription-domains/:uuid/credentials";
    const endpointDetails: import("../../constants").EndpointDetails;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            requestHeaderName: z.ZodString;
            requestHeaderValue: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>;
}
//# sourceMappingURL=index.d.ts.map
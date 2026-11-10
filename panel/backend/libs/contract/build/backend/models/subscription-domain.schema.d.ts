import { z } from 'zod';
export declare const MAX_CDN_PER_PRIMARY = 3;
export declare const SubscriptionDomainInputSchema: z.ZodObject<{
    name: z.ZodString;
    domain: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    path: z.ZodPipe<z.ZodDefault<z.ZodString>, z.ZodTransform<string, string>>;
    kind: z.ZodEnum<{
        CDN: "CDN";
        PRIMARY: "PRIMARY";
    }>;
    parentUuid: z.ZodDefault<z.ZodNullable<z.ZodUUID>>;
    isDefault: z.ZodDefault<z.ZodBoolean>;
    accessMode: z.ZodOptional<z.ZodEnum<{
        BLOCKED: "BLOCKED";
        CDN_ONLY: "CDN_ONLY";
        OPEN: "OPEN";
        REDIRECT: "REDIRECT";
    }>>;
    redirectDomainUuid: z.ZodOptional<z.ZodNullable<z.ZodUUID>>;
}, z.core.$strict>;
export declare const SubscriptionDomainSchema: z.ZodObject<{
    uuid: z.ZodUUID;
    name: z.ZodString;
    domain: z.ZodString;
    path: z.ZodString;
    kind: z.ZodEnum<{
        CDN: "CDN";
        PRIMARY: "PRIMARY";
    }>;
    parentUuid: z.ZodNullable<z.ZodUUID>;
    isDefault: z.ZodBoolean;
    accessMode: z.ZodEnum<{
        BLOCKED: "BLOCKED";
        CDN_ONLY: "CDN_ONLY";
        OPEN: "OPEN";
        REDIRECT: "REDIRECT";
    }>;
    redirectDomainUuid: z.ZodNullable<z.ZodUUID>;
    usersCount: z.ZodNumber;
    aliasesCount: z.ZodNumber;
    publicBaseUrl: z.ZodString;
    requestHeaderName: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type SubscriptionDomainInput = z.infer<typeof SubscriptionDomainInputSchema>;
//# sourceMappingURL=subscription-domain.schema.d.ts.map
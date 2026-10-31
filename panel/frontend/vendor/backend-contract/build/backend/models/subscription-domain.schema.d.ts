import { z } from 'zod';
export declare const SubscriptionDomainInputSchema: z.ZodObject<{
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
export declare const SubscriptionDomainSchema: z.ZodObject<{
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
export type SubscriptionDomainInput = z.infer<typeof SubscriptionDomainInputSchema>;
//# sourceMappingURL=subscription-domain.schema.d.ts.map
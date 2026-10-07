import z from 'zod';
declare const HostSelectorSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"uuids">;
    values: z.ZodArray<z.ZodUUID>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"remarkRegex">;
    pattern: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"tagRegex">;
    pattern: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"sameTagAsRecipient">;
}, z.core.$strip>], "type">;
declare const InjectHostsEntrySchema: z.ZodObject<{
    selector: z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"uuids">;
        values: z.ZodArray<z.ZodUUID>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"remarkRegex">;
        pattern: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"tagRegex">;
        pattern: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"sameTagAsRecipient">;
    }, z.core.$strip>], "type">;
    selectFrom: z.ZodOptional<z.ZodEnum<{
        ALL: "ALL";
        HIDDEN: "HIDDEN";
        NOT_HIDDEN: "NOT_HIDDEN";
    }>>;
    tagPrefix: z.ZodOptional<z.ZodString>;
    useHostRemarkAsTag: z.ZodOptional<z.ZodBoolean>;
    useHostTagAsTag: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const RemnawaveInjectorSchema: z.ZodObject<{
    injectHosts: z.ZodOptional<z.ZodArray<z.ZodObject<{
        selector: z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<"uuids">;
            values: z.ZodArray<z.ZodUUID>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"remarkRegex">;
            pattern: z.ZodString;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"tagRegex">;
            pattern: z.ZodString;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"sameTagAsRecipient">;
        }, z.core.$strip>], "type">;
        selectFrom: z.ZodOptional<z.ZodEnum<{
            ALL: "ALL";
            HIDDEN: "HIDDEN";
            NOT_HIDDEN: "NOT_HIDDEN";
        }>>;
        tagPrefix: z.ZodOptional<z.ZodString>;
        useHostRemarkAsTag: z.ZodOptional<z.ZodBoolean>;
        useHostTagAsTag: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>>;
    addVirtualHostAsOutbound: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type TRemnawaveInjector = z.infer<typeof RemnawaveInjectorSchema>;
export type TRemnawaveInjectorSelector = z.infer<typeof HostSelectorSchema>;
export type TRemnawaveInjectorSelectFrom = z.infer<typeof InjectHostsEntrySchema>['selectFrom'];
export {};
//# sourceMappingURL=remnawave-injector.schema.d.ts.map
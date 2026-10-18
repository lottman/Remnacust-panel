import z from 'zod';
declare const HostSelectorSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"uuids">;
    values: z.ZodOptional<z.ZodArray<z.ZodUUID>>;
    groups: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>]>>;
    expected: z.ZodOptional<z.ZodInt>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"tags">;
    values: z.ZodOptional<z.ZodArray<z.ZodString>>;
    groups: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>]>>;
    expected: z.ZodOptional<z.ZodInt>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"remarkRegex">;
    pattern: z.ZodString;
    expected: z.ZodOptional<z.ZodInt>;
    groups: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>]>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"tagRegex">;
    pattern: z.ZodString;
    expected: z.ZodOptional<z.ZodInt>;
    groups: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>]>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"sameTagAsRecipient">;
    expected: z.ZodOptional<z.ZodInt>;
    groups: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>]>>;
}, z.core.$strip>], "type">;
export declare const InjectHostsEntrySchema: z.ZodObject<{
    selector: z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"uuids">;
        values: z.ZodOptional<z.ZodArray<z.ZodUUID>>;
        groups: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>]>>;
        expected: z.ZodOptional<z.ZodInt>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"tags">;
        values: z.ZodOptional<z.ZodArray<z.ZodString>>;
        groups: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>]>>;
        expected: z.ZodOptional<z.ZodInt>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"remarkRegex">;
        pattern: z.ZodString;
        expected: z.ZodOptional<z.ZodInt>;
        groups: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>]>>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"tagRegex">;
        pattern: z.ZodString;
        expected: z.ZodOptional<z.ZodInt>;
        groups: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>]>>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"sameTagAsRecipient">;
        expected: z.ZodOptional<z.ZodInt>;
        groups: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>]>>;
    }, z.core.$strip>], "type">;
    mode: z.ZodOptional<z.ZodEnum<{
        random: "random";
        all: "all";
        group: "group";
    }>>;
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
            values: z.ZodOptional<z.ZodArray<z.ZodUUID>>;
            groups: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>]>>;
            expected: z.ZodOptional<z.ZodInt>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"tags">;
            values: z.ZodOptional<z.ZodArray<z.ZodString>>;
            groups: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>]>>;
            expected: z.ZodOptional<z.ZodInt>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"remarkRegex">;
            pattern: z.ZodString;
            expected: z.ZodOptional<z.ZodInt>;
            groups: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>]>>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"tagRegex">;
            pattern: z.ZodString;
            expected: z.ZodOptional<z.ZodInt>;
            groups: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>]>>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"sameTagAsRecipient">;
            expected: z.ZodOptional<z.ZodInt>;
            groups: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<string, unknown, z.core.$ZodTypeInternals<string, unknown>>>>]>>;
        }, z.core.$strip>], "type">;
        mode: z.ZodOptional<z.ZodEnum<{
            random: "random";
            all: "all";
            group: "group";
        }>>;
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
    assignTo: z.ZodOptional<z.ZodObject<{
        hosts: z.ZodOptional<z.ZodArray<z.ZodUUID>>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type TRemnawaveInjector = z.infer<typeof RemnawaveInjectorSchema>;
export type TRemnawaveInjectorSelector = z.infer<typeof HostSelectorSchema>;
export type TRemnawaveInjectorSelectFrom = z.infer<typeof InjectHostsEntrySchema>['selectFrom'];
export type TInjectHostsEntry = z.infer<typeof InjectHostsEntrySchema>;
export {};
//# sourceMappingURL=remnawave-injector.schema.d.ts.map
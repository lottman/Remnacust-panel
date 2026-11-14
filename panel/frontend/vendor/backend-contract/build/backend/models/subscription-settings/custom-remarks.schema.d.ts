import z from 'zod';
export declare const DEFAULT_SUBSCRIPTION_REMARKS: {
    expiredUsers: string[];
    limitedUsers: string[];
    disabledUsers: string[];
    frozenUsers: string[];
    emptyHosts: string[];
    HWIDMaxDevicesExceeded: string[];
    HWIDNotSupported: string[];
    HWIDRegistrationBlocked: string[];
    HWIDBlocked: string[];
    hostTrafficLimit: string[];
    hostTrafficPaused: string[];
};
export declare const SubscriptionActionSchema: z.ZodObject<{
    text: z.ZodString;
    buttonText: z.ZodString;
    url: z.ZodString;
}, z.core.$strip>;
export type ActiveExpiryItem = {
    kind: 'hosts';
} | {
    kind: 'text';
    text: string;
} | {
    kind: 'action';
    text: string;
    buttonText: string;
    url: string;
};
export declare function parseActiveExpiryRemark(remark: string): ActiveExpiryItem | null;
export declare const ActiveExpiryRuleSchema: z.ZodObject<{
    id: z.ZodPipe<z.ZodUUID, z.ZodTransform<string, string>>;
    enabled: z.ZodBoolean;
    daysBeforeExpiry: z.ZodNumber;
    scope: z.ZodEnum<{
        all: "all";
        selected: "selected";
    }>;
    internalSquadUuids: z.ZodArray<z.ZodPipe<z.ZodUUID, z.ZodTransform<string, string>>>;
    externalSquadUuids: z.ZodArray<z.ZodPipe<z.ZodUUID, z.ZodTransform<string, string>>>;
    remarks: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const ActiveExpirySchema: z.ZodObject<{
    rules: z.ZodArray<z.ZodObject<{
        id: z.ZodPipe<z.ZodUUID, z.ZodTransform<string, string>>;
        enabled: z.ZodBoolean;
        daysBeforeExpiry: z.ZodNumber;
        scope: z.ZodEnum<{
            all: "all";
            selected: "selected";
        }>;
        internalSquadUuids: z.ZodArray<z.ZodPipe<z.ZodUUID, z.ZodTransform<string, string>>>;
        externalSquadUuids: z.ZodArray<z.ZodPipe<z.ZodUUID, z.ZodTransform<string, string>>>;
        remarks: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type TActiveExpiryRule = z.infer<typeof ActiveExpiryRuleSchema>;
export declare const CustomRemarksSchema: z.ZodObject<{
    activeExpiry: z.ZodOptional<z.ZodObject<{
        rules: z.ZodArray<z.ZodObject<{
            id: z.ZodPipe<z.ZodUUID, z.ZodTransform<string, string>>;
            enabled: z.ZodBoolean;
            daysBeforeExpiry: z.ZodNumber;
            scope: z.ZodEnum<{
                all: "all";
                selected: "selected";
            }>;
            internalSquadUuids: z.ZodArray<z.ZodPipe<z.ZodUUID, z.ZodTransform<string, string>>>;
            externalSquadUuids: z.ZodArray<z.ZodPipe<z.ZodUUID, z.ZodTransform<string, string>>>;
            remarks: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    alwaysAvailableHostsPosition: z.ZodOptional<z.ZodEnum<{
        after: "after";
        before: "before";
    }>>;
    combineSubscriptionAndHwidRemarks: z.ZodDefault<z.ZodBoolean>;
    subscriptionAndHwidRemarkOrder: z.ZodDefault<z.ZodArray<z.ZodEnum<{
        DISABLED: "DISABLED";
        EXPIRED: "EXPIRED";
        FROZEN: "FROZEN";
        HWID_BLOCKED: "HWID_BLOCKED";
        HWID_REGISTRATION_BLOCKED: "HWID_REGISTRATION_BLOCKED";
    }>>>;
    action: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        text: z.ZodString;
        buttonText: z.ZodString;
        url: z.ZodString;
    }, z.core.$strip>>>;
    expiredUsers: z.ZodArray<z.ZodString>;
    limitedUsers: z.ZodArray<z.ZodString>;
    disabledUsers: z.ZodArray<z.ZodString>;
    frozenUsers: z.ZodDefault<z.ZodArray<z.ZodString>>;
    emptyHosts: z.ZodArray<z.ZodString>;
    HWIDMaxDevicesExceeded: z.ZodArray<z.ZodString>;
    HWIDNotSupported: z.ZodArray<z.ZodString>;
    HWIDRegistrationBlocked: z.ZodDefault<z.ZodArray<z.ZodString>>;
    HWIDBlocked: z.ZodDefault<z.ZodArray<z.ZodString>>;
    hostTrafficPaused: z.ZodDefault<z.ZodArray<z.ZodString>>;
    hostTrafficLimit: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type TCustomRemarks = z.infer<typeof CustomRemarksSchema>;
//# sourceMappingURL=custom-remarks.schema.d.ts.map
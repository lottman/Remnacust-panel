import z from 'zod';
export declare const DEFAULT_SUBSCRIPTION_REMARKS: {
    expiredUsers: string[];
    limitedUsers: string[];
    disabledUsers: string[];
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
export declare const CustomRemarksSchema: z.ZodObject<{
    alwaysAvailableHostsPosition: z.ZodOptional<z.ZodEnum<{
        before: "before";
        after: "after";
    }>>;
    combineSubscriptionAndHwidRemarks: z.ZodDefault<z.ZodBoolean>;
    subscriptionAndHwidRemarkOrder: z.ZodDefault<z.ZodArray<z.ZodEnum<{
        DISABLED: "DISABLED";
        EXPIRED: "EXPIRED";
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
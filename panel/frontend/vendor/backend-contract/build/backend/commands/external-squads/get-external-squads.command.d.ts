import { z } from 'zod';
export declare namespace GetExternalSquadsCommand {
    const url: "/api/external-squads/";
    const TSQ_url: "/api/external-squads/";
    const endpointDetails: import("../../constants").EndpointDetails;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            total: z.ZodNumber;
            externalSquads: z.ZodArray<z.ZodPipe<z.ZodObject<{
                uuid: z.ZodUUID;
                viewPosition: z.ZodInt;
                name: z.ZodString;
                tags: z.ZodArray<z.ZodString>;
                info: z.ZodObject<{
                    membersCount: z.ZodNumber;
                }, z.core.$strip>;
                templates: z.ZodArray<z.ZodObject<{
                    templateUuid: z.ZodUUID;
                    templateType: z.ZodEnum<{
                        readonly XRAY_JSON: 'XRAY_JSON';
                        readonly XRAY_BASE64: 'XRAY_BASE64';
                        readonly MIHOMO: 'MIHOMO';
                        readonly STASH: 'STASH';
                        readonly CLASH: 'CLASH';
                        readonly SINGBOX: 'SINGBOX';
                    }>;
                }, z.core.$strip>>;
                subscriptionSettings: z.ZodNullable<z.ZodObject<{
                    serveJsonAtBaseSubscription: z.ZodOptional<z.ZodBoolean>;
                    isShowCustomRemarks: z.ZodOptional<z.ZodBoolean>;
                    randomizeHosts: z.ZodOptional<z.ZodBoolean>;
                }, z.core.$strip>>;
                hostOverrides: z.ZodNullable<z.ZodObject<{
                    serverDescription: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                    vlessRouteId: z.ZodOptional<z.ZodNullable<z.ZodInt>>;
                }, z.core.$strip>>;
                responseHeaders: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                responseHeadersAdd: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                responseHeadersRemove: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
                hwidSettings: z.ZodNullable<z.ZodObject<{
                    enabled: z.ZodBoolean;
                    fallbackDeviceLimit: z.ZodNumber;
                    maxDevicesAnnounce: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                customRemarks: z.ZodNullable<z.ZodObject<{
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
                }, z.core.$strip>>;
                subpageConfigUuid: z.ZodNullable<z.ZodUUID>;
                createdAt: z.ZodPipe<z.ZodISODateTime, z.ZodTransform<Date, string>>;
                updatedAt: z.ZodPipe<z.ZodISODateTime, z.ZodTransform<Date, string>>;
            }, z.core.$strip>, z.ZodTransform<{
                uuid: string;
                viewPosition: number;
                name: string;
                tags: string[];
                info: {
                    membersCount: number;
                };
                templates: {
                    templateUuid: string;
                    templateType: "CLASH" | "MIHOMO" | "SINGBOX" | "STASH" | "XRAY_BASE64" | "XRAY_JSON";
                }[];
                subscriptionSettings: {
                    serveJsonAtBaseSubscription?: boolean | undefined;
                    isShowCustomRemarks?: boolean | undefined;
                    randomizeHosts?: boolean | undefined;
                } | null;
                hostOverrides: {
                    serverDescription?: string | null | undefined;
                    vlessRouteId?: number | null | undefined;
                } | null;
                responseHeadersRemove: string[];
                hwidSettings: {
                    enabled: boolean;
                    fallbackDeviceLimit: number;
                    maxDevicesAnnounce: string | null;
                } | null;
                customRemarks: {
                    alwaysAvailableHostsPosition?: "after" | "before" | undefined;
                    combineSubscriptionAndHwidRemarks: boolean;
                    subscriptionAndHwidRemarkOrder: ("DISABLED" | "EXPIRED" | "FROZEN" | "HWID_BLOCKED" | "HWID_REGISTRATION_BLOCKED")[];
                    action?: {
                        text: string;
                        buttonText: string;
                        url: string;
                    } | null | undefined;
                    expiredUsers: string[];
                    limitedUsers: string[];
                    disabledUsers: string[];
                    frozenUsers: string[];
                    emptyHosts: string[];
                    HWIDMaxDevicesExceeded: string[];
                    HWIDNotSupported: string[];
                    HWIDRegistrationBlocked: string[];
                    HWIDBlocked: string[];
                    hostTrafficPaused: string[];
                    hostTrafficLimit: string[];
                } | null;
                subpageConfigUuid: string | null;
                createdAt: Date;
                updatedAt: Date;
                responseHeadersAdd: Record<string, string>;
            }, {
                uuid: string;
                viewPosition: number;
                name: string;
                tags: string[];
                info: {
                    membersCount: number;
                };
                templates: {
                    templateUuid: string;
                    templateType: "CLASH" | "MIHOMO" | "SINGBOX" | "STASH" | "XRAY_BASE64" | "XRAY_JSON";
                }[];
                subscriptionSettings: {
                    serveJsonAtBaseSubscription?: boolean | undefined;
                    isShowCustomRemarks?: boolean | undefined;
                    randomizeHosts?: boolean | undefined;
                } | null;
                hostOverrides: {
                    serverDescription?: string | null | undefined;
                    vlessRouteId?: number | null | undefined;
                } | null;
                responseHeaders?: Record<string, string> | undefined;
                responseHeadersAdd?: Record<string, string> | undefined;
                responseHeadersRemove: string[];
                hwidSettings: {
                    enabled: boolean;
                    fallbackDeviceLimit: number;
                    maxDevicesAnnounce: string | null;
                } | null;
                customRemarks: {
                    alwaysAvailableHostsPosition?: "after" | "before" | undefined;
                    combineSubscriptionAndHwidRemarks: boolean;
                    subscriptionAndHwidRemarkOrder: ("DISABLED" | "EXPIRED" | "FROZEN" | "HWID_BLOCKED" | "HWID_REGISTRATION_BLOCKED")[];
                    action?: {
                        text: string;
                        buttonText: string;
                        url: string;
                    } | null | undefined;
                    expiredUsers: string[];
                    limitedUsers: string[];
                    disabledUsers: string[];
                    frozenUsers: string[];
                    emptyHosts: string[];
                    HWIDMaxDevicesExceeded: string[];
                    HWIDNotSupported: string[];
                    HWIDRegistrationBlocked: string[];
                    HWIDBlocked: string[];
                    hostTrafficPaused: string[];
                    hostTrafficLimit: string[];
                } | null;
                subpageConfigUuid: string | null;
                createdAt: Date;
                updatedAt: Date;
            }>>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-external-squads.command.d.ts.map
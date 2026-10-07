import { z } from 'zod';
export declare namespace CreateExternalSquadCommand {
    const url: "/api/external-squads/";
    const TSQ_url: "/api/external-squads/";
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestBodySchema: z.ZodObject<{
        name: z.ZodString;
    }, z.core.$strip>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodPipe<z.ZodObject<{
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
                    readonly XRAY_JSON: "XRAY_JSON";
                    readonly XRAY_BASE64: "XRAY_BASE64";
                    readonly MIHOMO: "MIHOMO";
                    readonly STASH: "STASH";
                    readonly CLASH: "CLASH";
                    readonly SINGBOX: "SINGBOX";
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
            }, z.core.$strip>>;
            subpageConfigUuid: z.ZodNullable<z.ZodUUID>;
            createdAt: z.ZodPipe<z.ZodISODateTime, z.ZodTransform<Date, string>>;
            updatedAt: z.ZodPipe<z.ZodISODateTime, z.ZodTransform<Date, string>>;
        }, z.core.$strip>, z.ZodTransform<{
            responseHeadersAdd: Record<string, string>;
            uuid: string;
            viewPosition: number;
            name: string;
            tags: string[];
            info: {
                membersCount: number;
            };
            templates: {
                templateUuid: string;
                templateType: "STASH" | "SINGBOX" | "MIHOMO" | "XRAY_JSON" | "CLASH" | "XRAY_BASE64";
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
                combineSubscriptionAndHwidRemarks: boolean;
                subscriptionAndHwidRemarkOrder: ("DISABLED" | "EXPIRED" | "HWID_BLOCKED" | "HWID_REGISTRATION_BLOCKED")[];
                expiredUsers: string[];
                limitedUsers: string[];
                disabledUsers: string[];
                emptyHosts: string[];
                HWIDMaxDevicesExceeded: string[];
                HWIDNotSupported: string[];
                HWIDRegistrationBlocked: string[];
                HWIDBlocked: string[];
                hostTrafficPaused: string[];
                hostTrafficLimit: string[];
                alwaysAvailableHostsPosition?: "before" | "after" | undefined;
                action?: {
                    text: string;
                    buttonText: string;
                    url: string;
                } | null | undefined;
            } | null;
            subpageConfigUuid: string | null;
            createdAt: Date;
            updatedAt: Date;
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
                templateType: "STASH" | "SINGBOX" | "MIHOMO" | "XRAY_JSON" | "CLASH" | "XRAY_BASE64";
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
                combineSubscriptionAndHwidRemarks: boolean;
                subscriptionAndHwidRemarkOrder: ("DISABLED" | "EXPIRED" | "HWID_BLOCKED" | "HWID_REGISTRATION_BLOCKED")[];
                expiredUsers: string[];
                limitedUsers: string[];
                disabledUsers: string[];
                emptyHosts: string[];
                HWIDMaxDevicesExceeded: string[];
                HWIDNotSupported: string[];
                HWIDRegistrationBlocked: string[];
                HWIDBlocked: string[];
                hostTrafficPaused: string[];
                hostTrafficLimit: string[];
                alwaysAvailableHostsPosition?: "before" | "after" | undefined;
                action?: {
                    text: string;
                    buttonText: string;
                    url: string;
                } | null | undefined;
            } | null;
            subpageConfigUuid: string | null;
            createdAt: Date;
            updatedAt: Date;
            responseHeaders?: Record<string, string> | undefined;
            responseHeadersAdd?: Record<string, string> | undefined;
        }>>;
    }, z.core.$strip>;
    type RequestBody = z.infer<typeof RequestBodySchema>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=create-external-squad.command.d.ts.map
import { z } from 'zod';
export declare namespace RegenerateHostSniCommand {
    const url: "/api/hosts/actions/regenerate-sni";
    const TSQ_url: "/api/hosts/actions/regenerate-sni";
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestBodySchema: z.ZodObject<{
        uuid: z.ZodUUID;
    }, z.core.$strip>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            uuid: z.ZodUUID;
            viewPosition: z.ZodInt;
            remark: z.ZodString;
            address: z.ZodString;
            port: z.ZodInt;
            path: z.ZodNullable<z.ZodString>;
            sni: z.ZodNullable<z.ZodString>;
            host: z.ZodNullable<z.ZodString>;
            alpn: z.ZodNullable<z.ZodEnum<{
                readonly H3: "h3";
                readonly H2: "h2";
                readonly HTTP_1_1: "http/1.1";
                readonly H_COMBINED: "h2,http/1.1";
                readonly H3_H2_H1_COMBINED: "h3,h2,http/1.1";
                readonly H3_H2_COMBINED: "h3,h2";
            }>>;
            fingerprint: z.ZodNullable<z.ZodString>;
            isDisabled: z.ZodBoolean;
            alwaysAvailable: z.ZodDefault<z.ZodBoolean>;
            onlyWhenInactive: z.ZodDefault<z.ZodBoolean>;
            userTrafficLimitBytes: z.ZodNullable<z.ZodNumber>;
            trafficLimitResetValue: z.ZodInt;
            trafficLimitResetUnit: z.ZodEnum<{
                DAYS: "DAYS";
                MONTHS: "MONTHS";
            }>;
            trafficLimitResetAnchorAt: z.ZodString;
            speedLimitMbps: z.ZodNullable<z.ZodInt>;
            totalSpeedLimitMbps: z.ZodDefault<z.ZodNullable<z.ZodInt>>;
            trafficMultiplier: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
            serverSpeedLimitMbps: z.ZodNullable<z.ZodInt>;
            useTagTrafficLimit: z.ZodDefault<z.ZodBoolean>;
            useTagSpeedLimit: z.ZodDefault<z.ZodBoolean>;
            useTagTotalSpeedLimit: z.ZodDefault<z.ZodBoolean>;
            domainRules: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                mode: z.ZodDefault<z.ZodEnum<{
                    ALLOW_ONLY: "ALLOW_ONLY";
                    OFF: "OFF";
                    DENY: "DENY";
                }>>;
                domains: z.ZodDefault<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>>>;
            sniRegeneration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                enabled: z.ZodDefault<z.ZodBoolean>;
                intervalHours: z.ZodDefault<z.ZodInt>;
                pool: z.ZodDefault<z.ZodArray<z.ZodString>>;
                rotateShortIds: z.ZodDefault<z.ZodBoolean>;
                shortIdLength: z.ZodDefault<z.ZodInt>;
                shortIdCount: z.ZodDefault<z.ZodInt>;
                lastRotatedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            }, z.core.$strip>>>;
            securityLayer: z.ZodDefault<z.ZodEnum<{
                readonly DEFAULT: "DEFAULT";
                readonly TLS: "TLS";
                readonly NONE: "NONE";
            }>>;
            xhttpExtraParams: z.ZodNullable<z.ZodUnknown>;
            muxParams: z.ZodNullable<z.ZodUnknown>;
            sockoptParams: z.ZodNullable<z.ZodUnknown>;
            finalMask: z.ZodNullable<z.ZodUnknown>;
            inbound: z.ZodObject<{
                configProfileUuid: z.ZodNullable<z.ZodUUID>;
                configProfileInboundUuid: z.ZodNullable<z.ZodUUID>;
            }, z.core.$strip>;
            serverDescription: z.ZodNullable<z.ZodString>;
            tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
            isHidden: z.ZodDefault<z.ZodBoolean>;
            overrideSniFromAddress: z.ZodDefault<z.ZodBoolean>;
            keepSniBlank: z.ZodDefault<z.ZodBoolean>;
            vlessRouteId: z.ZodNullable<z.ZodInt>;
            pinnedPeerCertSha256: z.ZodNullable<z.ZodString>;
            verifyPeerCertByName: z.ZodNullable<z.ZodString>;
            shuffleHost: z.ZodBoolean;
            mihomoX25519: z.ZodBoolean;
            mihomoIpVersion: z.ZodNullable<z.ZodEnum<{
                readonly DUAL: "dual";
                readonly IPV4: "ipv4";
                readonly IPV6: "ipv6";
                readonly IPV4_PREFER: "ipv4-prefer";
                readonly IPV6_PREFER: "ipv6-prefer";
            }>>;
            nodes: z.ZodArray<z.ZodUUID>;
            xrayJsonTemplateUuid: z.ZodNullable<z.ZodUUID>;
            excludeFromSubscriptionTypes: z.ZodArray<z.ZodEnum<{
                readonly XRAY_JSON: "XRAY_JSON";
                readonly XRAY_BASE64: "XRAY_BASE64";
                readonly MIHOMO: "MIHOMO";
                readonly STASH: "STASH";
                readonly CLASH: "CLASH";
                readonly SINGBOX: "SINGBOX";
            }>>;
            mapper: z.ZodObject<{
                xrayJson: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                    op: z.ZodLiteral<"copy">;
                    from: z.ZodString;
                    to: z.ZodString;
                }, z.core.$strip>, z.ZodObject<{
                    op: z.ZodLiteral<"set">;
                    value: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodArray<z.ZodJSONSchema>, z.ZodRecord<z.ZodString, z.ZodJSONSchema>]>;
                    to: z.ZodString;
                }, z.core.$strip>, z.ZodObject<{
                    op: z.ZodLiteral<"unset">;
                    to: z.ZodString;
                }, z.core.$strip>], "op">>>;
                mihomo: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                    op: z.ZodLiteral<"copy">;
                    from: z.ZodString;
                    to: z.ZodString;
                }, z.core.$strip>, z.ZodObject<{
                    op: z.ZodLiteral<"set">;
                    value: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodArray<z.ZodJSONSchema>, z.ZodRecord<z.ZodString, z.ZodJSONSchema>]>;
                    to: z.ZodString;
                }, z.core.$strip>, z.ZodObject<{
                    op: z.ZodLiteral<"unset">;
                    to: z.ZodString;
                }, z.core.$strip>], "op">>>;
                base64: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                    op: z.ZodLiteral<"copy">;
                    from: z.ZodString;
                    to: z.ZodString;
                }, z.core.$strip>, z.ZodObject<{
                    op: z.ZodLiteral<"set">;
                    value: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodArray<z.ZodJSONSchema>, z.ZodRecord<z.ZodString, z.ZodJSONSchema>]>;
                    to: z.ZodString;
                }, z.core.$strip>, z.ZodObject<{
                    op: z.ZodLiteral<"unset">;
                    to: z.ZodString;
                }, z.core.$strip>], "op">>>;
                singbox: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                    op: z.ZodLiteral<"copy">;
                    from: z.ZodString;
                    to: z.ZodString;
                }, z.core.$strip>, z.ZodObject<{
                    op: z.ZodLiteral<"set">;
                    value: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodArray<z.ZodJSONSchema>, z.ZodRecord<z.ZodString, z.ZodJSONSchema>]>;
                    to: z.ZodString;
                }, z.core.$strip>, z.ZodObject<{
                    op: z.ZodLiteral<"unset">;
                    to: z.ZodString;
                }, z.core.$strip>], "op">>>;
            }, z.core.$strip>;
            internalSquads: z.ZodObject<{
                mode: z.ZodEnum<{
                    readonly EXCLUDE: "EXCLUDE";
                    readonly ALLOW_ONLY: "ALLOW_ONLY";
                }>;
                squads: z.ZodArray<z.ZodUUID>;
            }, z.core.$strip>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type RequestBody = z.infer<typeof RequestBodySchema>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=regenerate-sni.command.d.ts.map
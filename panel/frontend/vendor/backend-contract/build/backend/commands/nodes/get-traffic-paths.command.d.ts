import { z } from 'zod';
export declare namespace GetTrafficPathsCommand {
    const url: "/api/nodes/traffic-paths";
    const TSQ_url: "/api/nodes/traffic-paths";
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestQuerySchema: z.ZodObject<{
        userShortUuid: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            user: z.ZodNullable<z.ZodObject<{
                shortUuid: z.ZodString;
                username: z.ZodString;
                activeInternalSquadUuids: z.ZodArray<z.ZodString>;
                status: z.ZodString;
                expireAt: z.ZodNullable<z.ZodString>;
                trafficLimitBytes: z.ZodNullable<z.ZodNumber>;
                usedTrafficBytes: z.ZodNullable<z.ZodNumber>;
                hwidDeviceLimit: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strip>>;
            profiles: z.ZodArray<z.ZodObject<{
                uuid: z.ZodString;
                name: z.ZodString;
                isActive: z.ZodBoolean;
                nodes: z.ZodArray<z.ZodObject<{
                    uuid: z.ZodString;
                    name: z.ZodString;
                    isDisabled: z.ZodBoolean;
                }, z.core.$strip>>;
                inbounds: z.ZodArray<z.ZodObject<{
                    uuid: z.ZodString;
                    tag: z.ZodString;
                    type: z.ZodNullable<z.ZodString>;
                    network: z.ZodNullable<z.ZodString>;
                    security: z.ZodNullable<z.ZodString>;
                    port: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
                routing: z.ZodObject<{
                    domainStrategy: z.ZodNullable<z.ZodString>;
                    rules: z.ZodArray<z.ZodObject<{
                        outboundTag: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
                        inboundTag: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
                        domains: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
                        ip: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
                        port: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
                        network: z.ZodNullable<z.ZodString>;
                        protocol: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
                outbounds: z.ZodArray<z.ZodObject<{
                    tag: z.ZodString;
                    protocol: z.ZodNullable<z.ZodString>;
                    exit: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
            hosts: z.ZodArray<z.ZodObject<{
                uuid: z.ZodString;
                remark: z.ZodString;
                address: z.ZodString;
                port: z.ZodNumber;
                isDisabled: z.ZodBoolean;
                isHidden: z.ZodBoolean;
                alwaysAvailable: z.ZodBoolean;
                userTrafficLimitBytes: z.ZodNullable<z.ZodNumber>;
                usedTrafficBytes: z.ZodNullable<z.ZodNumber>;
                speedLimitMbps: z.ZodNullable<z.ZodNumber>;
                domainRules: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
                inbound: z.ZodNullable<z.ZodObject<{
                    uuid: z.ZodString;
                    tag: z.ZodString;
                    type: z.ZodNullable<z.ZodString>;
                    network: z.ZodNullable<z.ZodString>;
                    security: z.ZodNullable<z.ZodString>;
                    port: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>>;
                profileUuid: z.ZodNullable<z.ZodString>;
                nodes: z.ZodArray<z.ZodString>;
            }, z.core.$strip>>;
            summary: z.ZodObject<{
                hostsTotal: z.ZodNumber;
                hostsAccessible: z.ZodNumber;
                inboundsTotal: z.ZodNumber;
                nodesTotal: z.ZodNumber;
                outboundsTotal: z.ZodNumber;
                routingRulesTotal: z.ZodNumber;
                blockedDomainsSamples: z.ZodArray<z.ZodString>;
            }, z.core.$strip>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type RequestQuery = z.infer<typeof RequestQuerySchema>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-traffic-paths.command.d.ts.map
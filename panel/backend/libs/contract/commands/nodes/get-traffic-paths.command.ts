import { z } from 'zod';

import { NODES_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';

export namespace GetTrafficPathsCommand {
    export const url = REST_API.NODES.TRAFFIC_PATHS;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        NODES_ROUTES.TRAFFIC_PATHS,
        'get',
        'Interactive traffic path map for a user',
        { scope: 'traffic-paths', kind: 'read' },
    );

    export const RequestQuerySchema = z.object({
        userShortUuid: z.string().min(1).max(128).optional(),
    });

    const RoutingRuleSchema = z.object({
        outboundTag: z.union([z.string(), z.array(z.string())]).nullable(),
        inboundTag: z.union([z.string(), z.array(z.string())]).nullable(),
        domains: z.union([z.string(), z.array(z.string())]).nullable(),
        ip: z.union([z.string(), z.array(z.string())]).nullable(),
        port: z.union([z.string(), z.number()]).nullable(),
        network: z.string().nullable(),
        protocol: z.union([z.string(), z.array(z.string())]).nullable(),
    });

    const OutboundSchema = z.object({
        tag: z.string(),
        protocol: z.string().nullable(),
        exit: z.string().nullable(),
    });

    const InboundSchema = z.object({
        uuid: z.string(),
        tag: z.string(),
        type: z.string().nullable(),
        network: z.string().nullable(),
        security: z.string().nullable(),
        port: z.number().nullable(),
    });

    export const ResponseSchema = z.object({
        response: z.object({
            user: z
                .object({
                    shortUuid: z.string(),
                    username: z.string(),
                    activeInternalSquadUuids: z.array(z.string()),
                    status: z.string(),
                    expireAt: z.string().nullable(),
                    trafficLimitBytes: z.number().nullable(),
                    usedTrafficBytes: z.number().nullable(),
                    hwidDeviceLimit: z.number().nullable(),
                })
                .nullable(),
            profiles: z.array(
                z.object({
                    uuid: z.string(),
                    name: z.string(),
                    isActive: z.boolean(),
                    nodes: z.array(
                        z.object({ uuid: z.string(), name: z.string(), isDisabled: z.boolean() }),
                    ),
                    inbounds: z.array(InboundSchema),
                    routing: z.object({
                        domainStrategy: z.string().nullable(),
                        rules: z.array(RoutingRuleSchema),
                    }),
                    outbounds: z.array(OutboundSchema),
                }),
            ),
            hosts: z.array(
                z.object({
                    uuid: z.string(),
                    remark: z.string(),
                    address: z.string(),
                    port: z.number(),
                    isDisabled: z.boolean(),
                    isHidden: z.boolean(),
                    alwaysAvailable: z.boolean(),
                    userTrafficLimitBytes: z.number().nullable(),
                    usedTrafficBytes: z.number().nullable(),
                    speedLimitMbps: z.number().nullable(),
                    domainRules: z.unknown().nullish(),
                    inbound: InboundSchema.nullable(),
                    profileUuid: z.string().nullable(),
                    nodes: z.array(z.string()),
                }),
            ),
            summary: z.object({
                hostsTotal: z.number(),
                hostsAccessible: z.number(),
                inboundsTotal: z.number(),
                nodesTotal: z.number(),
                outboundsTotal: z.number(),
                routingRulesTotal: z.number(),
                blockedDomainsSamples: z.array(z.string()),
            }),
        }),
    });

    export type RequestQuery = z.infer<typeof RequestQuerySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}

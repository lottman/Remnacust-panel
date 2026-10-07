"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetTrafficPathsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
var GetTrafficPathsCommand;
(function (GetTrafficPathsCommand) {
    GetTrafficPathsCommand.url = api_1.REST_API.NODES.TRAFFIC_PATHS;
    GetTrafficPathsCommand.TSQ_url = GetTrafficPathsCommand.url;
    GetTrafficPathsCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.NODES_ROUTES.TRAFFIC_PATHS, 'get', 'Interactive traffic path map for a user', { scope: 'traffic-paths', kind: 'read' });
    GetTrafficPathsCommand.RequestQuerySchema = zod_1.z.object({
        userShortUuid: zod_1.z.string().min(1).max(128).optional(),
    });
    const RoutingRuleSchema = zod_1.z.object({
        outboundTag: zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).nullable(),
        inboundTag: zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).nullable(),
        domains: zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).nullable(),
        ip: zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).nullable(),
        port: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).nullable(),
        network: zod_1.z.string().nullable(),
        protocol: zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).nullable(),
    });
    const OutboundSchema = zod_1.z.object({
        tag: zod_1.z.string(),
        protocol: zod_1.z.string().nullable(),
        exit: zod_1.z.string().nullable(),
    });
    const InboundSchema = zod_1.z.object({
        uuid: zod_1.z.string(),
        tag: zod_1.z.string(),
        type: zod_1.z.string().nullable(),
        network: zod_1.z.string().nullable(),
        security: zod_1.z.string().nullable(),
        port: zod_1.z.number().nullable(),
    });
    GetTrafficPathsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            user: zod_1.z
                .object({
                shortUuid: zod_1.z.string(),
                username: zod_1.z.string(),
                activeInternalSquadUuids: zod_1.z.array(zod_1.z.string()),
                status: zod_1.z.string(),
                expireAt: zod_1.z.string().nullable(),
                trafficLimitBytes: zod_1.z.number().nullable(),
                usedTrafficBytes: zod_1.z.number().nullable(),
                hwidDeviceLimit: zod_1.z.number().nullable(),
            })
                .nullable(),
            profiles: zod_1.z.array(zod_1.z.object({
                uuid: zod_1.z.string(),
                name: zod_1.z.string(),
                isActive: zod_1.z.boolean(),
                nodes: zod_1.z.array(zod_1.z.object({ uuid: zod_1.z.string(), name: zod_1.z.string(), isDisabled: zod_1.z.boolean() })),
                inbounds: zod_1.z.array(InboundSchema),
                routing: zod_1.z.object({
                    domainStrategy: zod_1.z.string().nullable(),
                    rules: zod_1.z.array(RoutingRuleSchema),
                }),
                outbounds: zod_1.z.array(OutboundSchema),
            })),
            hosts: zod_1.z.array(zod_1.z.object({
                uuid: zod_1.z.string(),
                remark: zod_1.z.string(),
                address: zod_1.z.string(),
                port: zod_1.z.number(),
                isDisabled: zod_1.z.boolean(),
                isHidden: zod_1.z.boolean(),
                alwaysAvailable: zod_1.z.boolean(),
                userTrafficLimitBytes: zod_1.z.number().nullable(),
                usedTrafficBytes: zod_1.z.number().nullable(),
                speedLimitMbps: zod_1.z.number().nullable(),
                domainRules: zod_1.z.unknown().nullish(),
                inbound: InboundSchema.nullable(),
                profileUuid: zod_1.z.string().nullable(),
                nodes: zod_1.z.array(zod_1.z.string()),
            })),
            summary: zod_1.z.object({
                hostsTotal: zod_1.z.number(),
                hostsAccessible: zod_1.z.number(),
                inboundsTotal: zod_1.z.number(),
                nodesTotal: zod_1.z.number(),
                outboundsTotal: zod_1.z.number(),
                routingRulesTotal: zod_1.z.number(),
                blockedDomainsSamples: zod_1.z.array(zod_1.z.string()),
            }),
        }),
    });
})(GetTrafficPathsCommand || (exports.GetTrafficPathsCommand = GetTrafficPathsCommand = {}));

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateNodeCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
const models_1 = require("../../models");
const node_control_addresses_schema_1 = require("../../models/node-control-addresses.schema");
const socks_proxy_schema_1 = require("../../models/socks-proxy.schema");
const node_response_1 = require("./node.response");
var UpdateNodeCommand;
(function (UpdateNodeCommand) {
    UpdateNodeCommand.url = api_1.REST_API.NODES.UPDATE;
    UpdateNodeCommand.TSQ_url = UpdateNodeCommand.url;
    UpdateNodeCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.NODES_ROUTES.UPDATE, 'patch', 'Update node', {
        scope: 'update',
        kind: 'write',
    });
    UpdateNodeCommand.RequestBodySchema = models_1.NodesSchema.pick({
        uuid: true,
    })
        .extend({
        name: zod_1.z.optional(zod_1.z.string().min(3).max(30)),
        address: node_control_addresses_schema_1.NodeControlAddressValueSchema.optional(),
        controlAddresses: node_control_addresses_schema_1.NodeControlAddressesSchema.optional(),
        removedControlAddresses: zod_1.z
            .array(node_control_addresses_schema_1.NodeControlAddressValueSchema)
            .min(1)
            .max(node_control_addresses_schema_1.NODE_CONTROL_ADDRESS_LIMIT)
            .refine((rows) => new Set(rows).size === rows.length)
            .optional(),
        controlRevision: zod_1.z.uuid().optional(),
        port: zod_1.z.optional(zod_1.z.number().min(1).max(65535)),
        proxyUrl: socks_proxy_schema_1.SocksProxyUrlSchema.nullish(),
        isTrafficTrackingActive: zod_1.z.optional(zod_1.z.boolean()),
        trafficLimitBytes: zod_1.z.optional(zod_1.z.number().min(0)),
        notifyPercent: zod_1.z.optional(zod_1.z.number().min(0).max(100)),
        trafficResetDay: zod_1.z.optional(zod_1.z.int().min(0).max(31)),
        countryCode: zod_1.z.optional(zod_1.z.string().max(2).toUpperCase()),
        consumptionMultiplier: zod_1.z.optional(zod_1.z
            .number()
            .min(0.0)
            .max(100.0)
            .transform((n) => Number(n.toFixed(1)))),
        nodeConsumptionMultiplier: zod_1.z.optional(zod_1.z
            .number()
            .min(0.0)
            .max(100.0)
            .transform((n) => Number(n.toFixed(1)))),
        configProfile: zod_1.z
            .object({
            activeConfigProfileUuid: zod_1.z.uuid(),
            activeInbounds: zod_1.z.array(zod_1.z.uuid()),
        })
            .optional(),
        providerUuid: zod_1.z.uuid().nullish(),
        tags: zod_1.z.optional(zod_1.z
            .array(zod_1.z
            .string()
            .regex(/^[A-Za-z0-9_:]+$/, 'Tag can only contain letters, numbers, underscores and colons')
            .max(36, 'Each tag must be less than 36 characters'))
            .max(10, 'Maximum 10 tags')),
        activePluginUuid: zod_1.z.uuid().nullish(),
        integrationUuids: zod_1.z.optional(zod_1.z.array(zod_1.z.uuid()).max(20, 'Maximum 20 integrations')),
        note: zod_1.z.optional(zod_1.z.string().max(255).nullable()),
        ips: zod_1.z.optional(models_1.NodeIpsSchema),
    })
        .refine((value) => value.controlAddresses === undefined || value.controlRevision !== undefined, {
        message: 'Reload the node connection settings before saving control addresses',
        path: ['controlRevision'],
    })
        .refine(({ controlAddresses, removedControlAddresses }) => removedControlAddresses === undefined ||
        (controlAddresses !== undefined &&
            controlAddresses.every(({ address }) => !removedControlAddresses.includes(address))), {
        message: 'Removed addresses must be excluded from the updated control address list',
        path: ['removedControlAddresses'],
    });
    UpdateNodeCommand.ResponseSchema = node_response_1.NodeResponseSchema;
})(UpdateNodeCommand || (exports.UpdateNodeCommand = UpdateNodeCommand = {}));

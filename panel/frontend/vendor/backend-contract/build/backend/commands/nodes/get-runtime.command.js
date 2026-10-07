"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetNodeRuntimeCommand = exports.NodeRuntimeSchema = void 0;
const zod_1 = require("zod");
const constants_1 = require("../../constants");
const count = zod_1.z.number().finite().nonnegative();
const percent = count.max(100).nullable();
exports.NodeRuntimeSchema = zod_1.z.object({
    sampledAt: zod_1.z.iso.datetime(), nodeVersion: zod_1.z.string(),
    system: zod_1.z.object({
        cpu: zod_1.z.object({ cores: count, model: zod_1.z.string().nullable(), usagePercent: percent,
            sampleMs: count, loadAverage: zod_1.z.array(count) }),
        memory: zod_1.z.object({ totalBytes: count, availableBytes: count, usedBytes: count, usedPercent: percent }),
        uptimeSeconds: count, platform: zod_1.z.string(), arch: zod_1.z.string(),
        disks: zod_1.z.array(zod_1.z.object({ path: zod_1.z.string(), scope: zod_1.z.literal('node-filesystem'),
            totalBytes: count.nullable(), freeBytes: count.nullable(), availableBytes: count.nullable(),
            usedBytes: count.nullable(), usedPercent: percent, totalInodes: count.nullable(),
            freeInodes: count.nullable(), error: zod_1.z.literal('unavailable').nullable() })),
        network: zod_1.z.object({ interface: zod_1.z.string(), rxBytesPerSec: count, txBytesPerSec: count,
            rxTotal: count, txTotal: count }).nullable(),
    }),
    xray: zod_1.z.object({ state: zod_1.z.enum(['running', 'stopped', 'unknown']), pid: count.nullable(),
        version: zod_1.z.string().nullable(), build: zod_1.z.string().nullable(), statsAvailable: zod_1.z.boolean(),
        uptimeSeconds: count.nullable(), memoryBytes: count.nullable(), goroutines: count.nullable() }),
});
var GetNodeRuntimeCommand;
(function (GetNodeRuntimeCommand) {
    GetNodeRuntimeCommand.url = (uuid) => `/api/nodes/${uuid}/runtime`;
    GetNodeRuntimeCommand.TSQ_url = GetNodeRuntimeCommand.url(':uuid');
    GetNodeRuntimeCommand.endpointDetails = (0, constants_1.getEndpointDetails)(':uuid/runtime', 'get', 'Get node disk, CPU, memory, network, health and Xray runtime', { scope: 'runtime', kind: 'read' });
    GetNodeRuntimeCommand.RequestParamSchema = zod_1.z.object({ uuid: zod_1.z.uuid() });
    GetNodeRuntimeCommand.ResponseSchema = zod_1.z.object({ response: zod_1.z.object({
            uuid: zod_1.z.uuid(), checkedAt: zod_1.z.iso.datetime(), available: zod_1.z.boolean(),
            reason: zod_1.z.enum(['disabled', 'unavailable_or_unsupported', 'invalid_node_response']).nullable(),
            health: zod_1.z.object({
                connection: zod_1.z.enum(['connected', 'connecting', 'disconnected', 'disabled']),
                lastCheck: zod_1.z.object({ checkedAt: zod_1.z.iso.datetime(),
                    status: zod_1.z.enum(['ok', 'retry', 'unreachable', 'xray_missing', 'error']) }).nullable(),
            }),
            runtime: exports.NodeRuntimeSchema.nullable(),
        }) });
})(GetNodeRuntimeCommand || (exports.GetNodeRuntimeCommand = GetNodeRuntimeCommand = {}));

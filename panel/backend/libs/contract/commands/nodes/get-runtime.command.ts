import { z } from 'zod';
import { getEndpointDetails } from '../../constants';

const count = z.number().finite().nonnegative();
const percent = count.max(100).nullable();
export const NodeRuntimeSchema = z.object({
    sampledAt: z.iso.datetime(), nodeVersion: z.string(),
    system: z.object({
        cpu: z.object({ cores: count, model: z.string().nullable(), usagePercent: percent,
            sampleMs: count, loadAverage: z.array(count) }),
        memory: z.object({ totalBytes: count, availableBytes: count, usedBytes: count, usedPercent: percent }),
        uptimeSeconds: count, platform: z.string(), arch: z.string(),
        disks: z.array(z.object({ path: z.string(), scope: z.literal('node-filesystem'),
            totalBytes: count.nullable(), freeBytes: count.nullable(), availableBytes: count.nullable(),
            usedBytes: count.nullable(), usedPercent: percent, totalInodes: count.nullable(),
            freeInodes: count.nullable(), error: z.literal('unavailable').nullable() })),
        network: z.object({ interface: z.string(), rxBytesPerSec: count, txBytesPerSec: count,
            rxTotal: count, txTotal: count }).nullable(),
    }),
    xray: z.object({ state: z.enum(['running', 'stopped', 'unknown']), pid: count.nullable(),
        version: z.string().nullable(), build: z.string().nullable(), statsAvailable: z.boolean(),
        uptimeSeconds: count.nullable(), memoryBytes: count.nullable(), goroutines: count.nullable() }),
});

export namespace GetNodeRuntimeCommand {
    export const url = (uuid: string) => `/api/nodes/${uuid}/runtime`;
    export const TSQ_url = url(':uuid');
    export const endpointDetails = getEndpointDetails(':uuid/runtime', 'get',
        'Get node disk, CPU, memory, network, health and Xray runtime', { scope: 'runtime', kind: 'read' });
    export const RequestParamSchema = z.object({ uuid: z.uuid() });
    export const ResponseSchema = z.object({ response: z.object({
        uuid: z.uuid(), checkedAt: z.iso.datetime(), available: z.boolean(),
        reason: z.enum(['disabled', 'unavailable_or_unsupported', 'invalid_node_response']).nullable(),
        health: z.object({
            connection: z.enum(['connected', 'connecting', 'disconnected', 'disabled']),
            lastCheck: z.object({ checkedAt: z.iso.datetime(),
                status: z.enum(['ok', 'retry', 'unreachable', 'xray_missing', 'error']) }).nullable(),
        }),
        runtime: NodeRuntimeSchema.nullable(),
    }) });
    export type Response = z.infer<typeof ResponseSchema>;
}

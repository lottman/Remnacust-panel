import { z } from 'zod';
export declare const NodeRuntimeSchema: z.ZodObject<{
    sampledAt: z.ZodISODateTime;
    nodeVersion: z.ZodString;
    system: z.ZodObject<{
        cpu: z.ZodObject<{
            cores: z.ZodNumber;
            model: z.ZodNullable<z.ZodString>;
            usagePercent: z.ZodNullable<z.ZodNumber>;
            sampleMs: z.ZodNumber;
            loadAverage: z.ZodArray<z.ZodNumber>;
        }, z.core.$strip>;
        memory: z.ZodObject<{
            totalBytes: z.ZodNumber;
            availableBytes: z.ZodNumber;
            usedBytes: z.ZodNumber;
            usedPercent: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>;
        uptimeSeconds: z.ZodNumber;
        platform: z.ZodString;
        arch: z.ZodString;
        disks: z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            scope: z.ZodLiteral<"node-filesystem">;
            totalBytes: z.ZodNullable<z.ZodNumber>;
            freeBytes: z.ZodNullable<z.ZodNumber>;
            availableBytes: z.ZodNullable<z.ZodNumber>;
            usedBytes: z.ZodNullable<z.ZodNumber>;
            usedPercent: z.ZodNullable<z.ZodNumber>;
            totalInodes: z.ZodNullable<z.ZodNumber>;
            freeInodes: z.ZodNullable<z.ZodNumber>;
            error: z.ZodNullable<z.ZodLiteral<"unavailable">>;
        }, z.core.$strip>>;
        network: z.ZodNullable<z.ZodObject<{
            interface: z.ZodString;
            rxBytesPerSec: z.ZodNumber;
            txBytesPerSec: z.ZodNumber;
            rxTotal: z.ZodNumber;
            txTotal: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    xray: z.ZodObject<{
        state: z.ZodEnum<{
            unknown: "unknown";
            running: "running";
            stopped: "stopped";
        }>;
        pid: z.ZodNullable<z.ZodNumber>;
        version: z.ZodNullable<z.ZodString>;
        build: z.ZodNullable<z.ZodString>;
        statsAvailable: z.ZodBoolean;
        uptimeSeconds: z.ZodNullable<z.ZodNumber>;
        memoryBytes: z.ZodNullable<z.ZodNumber>;
        goroutines: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare namespace GetNodeRuntimeCommand {
    const url: (uuid: string) => string;
    const TSQ_url: string;
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestParamSchema: z.ZodObject<{
        uuid: z.ZodUUID;
    }, z.core.$strip>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            uuid: z.ZodUUID;
            checkedAt: z.ZodISODateTime;
            available: z.ZodBoolean;
            reason: z.ZodNullable<z.ZodEnum<{
                disabled: "disabled";
                unavailable_or_unsupported: "unavailable_or_unsupported";
                invalid_node_response: "invalid_node_response";
            }>>;
            health: z.ZodObject<{
                connection: z.ZodEnum<{
                    disabled: "disabled";
                    connected: "connected";
                    connecting: "connecting";
                    disconnected: "disconnected";
                }>;
                lastCheck: z.ZodNullable<z.ZodObject<{
                    checkedAt: z.ZodISODateTime;
                    status: z.ZodEnum<{
                        error: "error";
                        ok: "ok";
                        retry: "retry";
                        unreachable: "unreachable";
                        xray_missing: "xray_missing";
                    }>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            runtime: z.ZodNullable<z.ZodObject<{
                sampledAt: z.ZodISODateTime;
                nodeVersion: z.ZodString;
                system: z.ZodObject<{
                    cpu: z.ZodObject<{
                        cores: z.ZodNumber;
                        model: z.ZodNullable<z.ZodString>;
                        usagePercent: z.ZodNullable<z.ZodNumber>;
                        sampleMs: z.ZodNumber;
                        loadAverage: z.ZodArray<z.ZodNumber>;
                    }, z.core.$strip>;
                    memory: z.ZodObject<{
                        totalBytes: z.ZodNumber;
                        availableBytes: z.ZodNumber;
                        usedBytes: z.ZodNumber;
                        usedPercent: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strip>;
                    uptimeSeconds: z.ZodNumber;
                    platform: z.ZodString;
                    arch: z.ZodString;
                    disks: z.ZodArray<z.ZodObject<{
                        path: z.ZodString;
                        scope: z.ZodLiteral<"node-filesystem">;
                        totalBytes: z.ZodNullable<z.ZodNumber>;
                        freeBytes: z.ZodNullable<z.ZodNumber>;
                        availableBytes: z.ZodNullable<z.ZodNumber>;
                        usedBytes: z.ZodNullable<z.ZodNumber>;
                        usedPercent: z.ZodNullable<z.ZodNumber>;
                        totalInodes: z.ZodNullable<z.ZodNumber>;
                        freeInodes: z.ZodNullable<z.ZodNumber>;
                        error: z.ZodNullable<z.ZodLiteral<"unavailable">>;
                    }, z.core.$strip>>;
                    network: z.ZodNullable<z.ZodObject<{
                        interface: z.ZodString;
                        rxBytesPerSec: z.ZodNumber;
                        txBytesPerSec: z.ZodNumber;
                        rxTotal: z.ZodNumber;
                        txTotal: z.ZodNumber;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
                xray: z.ZodObject<{
                    state: z.ZodEnum<{
                        unknown: "unknown";
                        running: "running";
                        stopped: "stopped";
                    }>;
                    pid: z.ZodNullable<z.ZodNumber>;
                    version: z.ZodNullable<z.ZodString>;
                    build: z.ZodNullable<z.ZodString>;
                    statsAvailable: z.ZodBoolean;
                    uptimeSeconds: z.ZodNullable<z.ZodNumber>;
                    memoryBytes: z.ZodNullable<z.ZodNumber>;
                    goroutines: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-runtime.command.d.ts.map
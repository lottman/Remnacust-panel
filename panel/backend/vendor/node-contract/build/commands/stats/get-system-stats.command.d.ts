import { z } from 'zod';
export declare namespace GetSystemStatsCommand {
    const url: "/node/stats/get-system-stats";
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            userStateSynchronized: z.ZodOptional<z.ZodBoolean>;
            bindingTraffic: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                capability: z.ZodLiteral<"remnacust-profile-traffic-v1">;
                coreProcessId: z.ZodUUID;
                capturedAt: z.ZodISODateTime;
                bindings: z.ZodArray<z.ZodObject<{
                    bindingUuid: z.ZodUUID;
                    uplink: z.ZodString;
                    downlink: z.ZodString;
                    available: z.ZodBoolean;
                    retired: z.ZodBoolean;
                }, z.core.$strip>>;
            }, z.core.$strip>>>;
            xrayInfo: z.ZodNullable<z.ZodObject<{
                numGoroutine: z.ZodNumber;
                numGC: z.ZodNumber;
                alloc: z.ZodNumber;
                totalAlloc: z.ZodNumber;
                sys: z.ZodNumber;
                mallocs: z.ZodNumber;
                frees: z.ZodNumber;
                liveObjects: z.ZodNumber;
                pauseTotalNs: z.ZodNumber;
                uptime: z.ZodNumber;
            }, z.core.$strip>>;
            plugins: z.ZodObject<{
                torrentBlocker: z.ZodObject<{
                    reportsCount: z.ZodNumber;
                }, z.core.$strip>;
            }, z.core.$strip>;
            system: z.ZodObject<{
                stats: z.ZodObject<{
                    memoryFree: z.ZodNumber;
                    memoryUsed: z.ZodNumber;
                    uptime: z.ZodNumber;
                    loadAvg: z.ZodArray<z.ZodNumber>;
                    interface: z.ZodNullable<z.ZodObject<{
                        interface: z.ZodString;
                        rxBytesPerSec: z.ZodNumber;
                        txBytesPerSec: z.ZodNumber;
                        rxTotal: z.ZodNumber;
                        txTotal: z.ZodNumber;
                    }, z.core.$strip>>;
                }, z.core.$strip>;
            }, z.core.$strip>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-system-stats.command.d.ts.map
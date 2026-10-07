import { z } from 'zod';
export declare namespace StartXrayCommand {
    const url: "/node/xray/start";
    const RequestSchema: z.ZodObject<{
        internals: z.ZodObject<{
            metadata: z.ZodOptional<z.ZodObject<{
                name: z.ZodString;
                uuid: z.ZodString;
                id: z.ZodNumber;
                tags: z.ZodArray<z.ZodString>;
                countryCode: z.ZodString;
            }, z.core.$strip>>;
            integrations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            forceRestart: z.ZodDefault<z.ZodBoolean>;
            hashes: z.ZodObject<{
                emptyConfig: z.ZodString;
                inbounds: z.ZodArray<z.ZodObject<{
                    usersCount: z.ZodNumber;
                    hash: z.ZodString;
                    tag: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
        }, z.core.$strip>;
        xrayConfig: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strip>;
    type Request = z.infer<typeof RequestSchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            isStarted: z.ZodBoolean;
            version: z.ZodNullable<z.ZodString>;
            error: z.ZodNullable<z.ZodString>;
            nodeInformation: z.ZodObject<{
                version: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
            system: z.ZodObject<{
                info: z.ZodObject<{
                    arch: z.ZodString;
                    cpus: z.ZodInt;
                    cpuModel: z.ZodString;
                    memoryTotal: z.ZodNumber;
                    hostname: z.ZodString;
                    platform: z.ZodString;
                    release: z.ZodString;
                    type: z.ZodString;
                    version: z.ZodString;
                    networkInterfaces: z.ZodArray<z.ZodString>;
                }, z.core.$strip>;
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
//# sourceMappingURL=start.command.d.ts.map
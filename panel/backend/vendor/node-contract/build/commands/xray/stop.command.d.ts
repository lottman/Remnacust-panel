import { z } from 'zod';
export declare namespace StopXrayCommand {
    const url: "/node/xray/stop";
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            isStopped: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=stop.command.d.ts.map
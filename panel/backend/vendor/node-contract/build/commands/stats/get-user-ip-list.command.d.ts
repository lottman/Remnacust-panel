import { z } from 'zod';
export declare namespace GetUserIpListCommand {
    const url: "/node/stats/get-user-ip-list";
    const RequestSchema: z.ZodObject<{
        userId: z.ZodString;
    }, z.core.$strip>;
    type Request = z.infer<typeof RequestSchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            ips: z.ZodArray<z.ZodObject<{
                ip: z.ZodString;
                lastSeen: z.ZodPipe<z.ZodISODateTime, z.ZodTransform<Date, string>>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-user-ip-list.command.d.ts.map
import { z } from 'zod';
export declare namespace GetUsersIpListCommand {
    const url: "/node/stats/get-users-ip-list";
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            users: z.ZodArray<z.ZodObject<{
                userId: z.ZodString;
                ips: z.ZodArray<z.ZodObject<{
                    ip: z.ZodString;
                    lastSeen: z.ZodPipe<z.ZodISODateTime, z.ZodTransform<Date, string>>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-users-ip-list.command.d.ts.map
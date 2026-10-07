import { z } from 'zod';
export declare namespace DropIpsCommand {
    const url: "/node/handler/drop-ips";
    const RequestSchema: z.ZodObject<{
        ips: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    type Request = z.infer<typeof RequestSchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            success: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=drop-ips.command.d.ts.map
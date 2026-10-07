import { z } from 'zod';
export declare namespace UnblockIpsCommand {
    const url: "/node/plugin/nftables/unblock-ips";
    const RequestSchema: z.ZodObject<{
        ips: z.ZodArray<z.ZodUnion<readonly [z.ZodIPv4, z.ZodIPv6]>>;
    }, z.core.$strip>;
    type Request = z.infer<typeof RequestSchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            accepted: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=unblock-ips.schema.d.ts.map
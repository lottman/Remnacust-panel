import { z } from 'zod';
export declare namespace BlockIpsCommand {
    const url: "/node/plugin/nftables/block-ips";
    const RequestSchema: z.ZodObject<{
        ips: z.ZodArray<z.ZodObject<{
            ip: z.ZodUnion<readonly [z.ZodIPv4, z.ZodIPv6]>;
            timeout: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    type Request = z.infer<typeof RequestSchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            accepted: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=block-ips.schema.d.ts.map
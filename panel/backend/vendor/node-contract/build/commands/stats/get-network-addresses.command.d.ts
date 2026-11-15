import { z } from 'zod';
export declare namespace GetNetworkAddressesCommand {
    const url: "/node/stats/network-addresses";
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            addresses: z.ZodPipe<z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>>, z.ZodTransform<string[], string[]>>;
            complete: z.ZodLiteral<true>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-network-addresses.command.d.ts.map
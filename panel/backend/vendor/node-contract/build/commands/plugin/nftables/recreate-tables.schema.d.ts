import { z } from 'zod';
export declare namespace RecreateTablesCommand {
    const url: "/node/plugin/nftables/recreate-tables";
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            accepted: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=recreate-tables.schema.d.ts.map
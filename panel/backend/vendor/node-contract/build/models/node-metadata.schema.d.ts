import { z } from 'zod';
export declare const NodeMetadataSchema: z.ZodObject<{
    name: z.ZodString;
    uuid: z.ZodString;
    id: z.ZodNumber;
    tags: z.ZodArray<z.ZodString>;
    countryCode: z.ZodString;
}, z.core.$strip>;
export type TNodeMetadata = z.infer<typeof NodeMetadataSchema>;
//# sourceMappingURL=node-metadata.schema.d.ts.map
import { z } from 'zod';
export declare const NODE_CONTROL_ADDRESS_LIMIT = 65;
export declare function normalizeNodeControlAddress(value: string): string | null;
export declare const NodeControlAddressValueSchema: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
export declare const NodeControlAddressSchema: z.ZodObject<{
    address: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    enabled: z.ZodBoolean;
}, z.core.$strip>;
export declare const NodeControlAddressesSchema: z.ZodArray<z.ZodObject<{
    address: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    enabled: z.ZodBoolean;
}, z.core.$strip>>;
export type TNodeControlAddress = z.infer<typeof NodeControlAddressSchema>;
export type TNodeControlAddresses = z.infer<typeof NodeControlAddressesSchema>;
//# sourceMappingURL=node-control-addresses.schema.d.ts.map
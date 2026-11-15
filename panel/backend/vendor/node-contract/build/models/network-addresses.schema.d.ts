import { z } from 'zod';
export declare const MAX_NETWORK_ADDRESSES = 64;
export declare const AssignedUnicastAddressSchema: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
export declare const NetworkAddressesSchema: z.ZodPipe<z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>>, z.ZodTransform<string[], string[]>>;
//# sourceMappingURL=network-addresses.schema.d.ts.map
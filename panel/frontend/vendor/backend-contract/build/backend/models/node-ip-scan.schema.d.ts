import { z } from 'zod';
export declare const NodeIpScanInfoSchema: z.ZodObject<{
    addresses: z.ZodArray<z.ZodUnion<readonly [z.ZodIPv4, z.ZodIPv6]>>;
    scannedAt: z.ZodISODateTime;
}, z.core.$strip>;
export type TNodeIpScanInfo = z.infer<typeof NodeIpScanInfoSchema>;
//# sourceMappingURL=node-ip-scan.schema.d.ts.map
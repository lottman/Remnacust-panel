import { z } from 'zod';

export const NodeIpScanInfoSchema = z.object({
    addresses: z.array(z.union([z.ipv4(), z.ipv6()])).max(64),
    scannedAt: z.iso.datetime(),
});

export type TNodeIpScanInfo = z.infer<typeof NodeIpScanInfoSchema>;

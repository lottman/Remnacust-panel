import { z } from 'zod';

const IPv4 = z.ipv4();
const IPv6 = z.ipv6();

export const NODE_CONTROL_ADDRESS_LIMIT = 65;

export function normalizeNodeControlAddress(value: string): string | null {
    if (
        value.length > 255 ||
        [...value].some(
            (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        )
    )
        return null;
    const host = value.trim().replace(/^\[([^\]]+)\]$/, '$1');
    if (host.includes('%')) return null;
    if (IPv6.safeParse(host).success) {
        return new URL(`https://[${host}]`).hostname.slice(1, -1).toLowerCase();
    }
    if (IPv4.safeParse(host).success) return host;
    if (!host || host.length > 253 || /[\s\\/:@?#[\]]/u.test(host)) return null;
    try {
        const normalized = new URL(`https://${host}`).hostname.toLowerCase().replace(/\.$/, '');
        return normalized.length <= 253 &&
            normalized
                .split('.')
                .every((label) => /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/.test(label))
            ? normalized
            : null;
    } catch {
        return null;
    }
}

export const NodeControlAddressValueSchema = z
    .string()
    .max(255)
    .transform((value, ctx) => {
        const normalized = normalizeNodeControlAddress(value);
        if (normalized !== null) return normalized;
        ctx.addIssue({ code: 'custom', message: 'Invalid node control address' });
        return z.NEVER;
    });

export const NodeControlAddressSchema = z.object({
    address: NodeControlAddressValueSchema,
    enabled: z.boolean(),
});

export const NodeControlAddressesSchema = z
    .array(NodeControlAddressSchema)
    .max(NODE_CONTROL_ADDRESS_LIMIT)
    .refine((rows) => new Set(rows.map((row) => row.address)).size === rows.length, {
        message: 'Node control addresses must be unique',
    });

export type TNodeControlAddress = z.infer<typeof NodeControlAddressSchema>;
export type TNodeControlAddresses = z.infer<typeof NodeControlAddressesSchema>;

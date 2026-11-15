"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkAddressesSchema = exports.AssignedUnicastAddressSchema = exports.MAX_NETWORK_ADDRESSES = void 0;
const zod_1 = require("zod");
exports.MAX_NETWORK_ADDRESSES = 64;
const ipv4 = zod_1.z.ipv4();
exports.AssignedUnicastAddressSchema = zod_1.z
    .string()
    .max(45)
    .transform((address, context) => {
    const invalid = () => {
        context.addIssue({
            code: 'custom',
            message: 'Expected an assigned unicast IP address',
        });
        return zod_1.z.NEVER;
    };
    let canonical;
    if (ipv4.safeParse(address).success) {
        canonical = address;
    }
    else {
        if (!address.includes(':') || !/^[a-fA-F0-9:.]+$/.test(address))
            return invalid();
        try {
            canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
        }
        catch {
            return invalid();
        }
        const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(canonical);
        if (mapped) {
            const high = parseInt(mapped[1], 16);
            const low = parseInt(mapped[2], 16);
            canonical = [high >> 8, high & 255, low >> 8, low & 255].join('.');
        }
    }
    if (!canonical.includes(':')) {
        const [first, second] = canonical.split('.').map(Number);
        if (first === 0 || first === 127 || (first === 169 && second === 254) || first >= 224)
            return invalid();
    }
    else {
        const first = parseInt(canonical.split(':')[0], 16);
        if (!(first >= 0x2000 && first <= 0x3fff) && !(first >= 0xfc00 && first <= 0xfdff))
            return invalid();
    }
    return canonical;
});
exports.NetworkAddressesSchema = zod_1.z
    .array(exports.AssignedUnicastAddressSchema)
    .max(exports.MAX_NETWORK_ADDRESSES)
    .transform((addresses) => [...new Set(addresses)].sort());

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeIpScanInfoSchema = void 0;
const zod_1 = require("zod");
exports.NodeIpScanInfoSchema = zod_1.z.object({
    addresses: zod_1.z.array(zod_1.z.union([zod_1.z.ipv4(), zod_1.z.ipv6()])).max(64),
    scannedAt: zod_1.z.iso.datetime(),
});

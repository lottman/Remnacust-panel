"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XrayWebhookSchema = void 0;
const zod_1 = require("zod");
exports.XrayWebhookSchema = zod_1.z.object({
    email: zod_1.z.string().nullable(),
    level: zod_1.z.number().nullable(),
    protocol: zod_1.z.string().nullable(),
    network: zod_1.z.string(),
    source: zod_1.z.string().nullable(),
    destination: zod_1.z.string(),
    routeTarget: zod_1.z.string().nullable(),
    originalTarget: zod_1.z.string().nullable(),
    inboundTag: zod_1.z.string().nullable(),
    inboundName: zod_1.z.string().nullable(),
    inboundLocal: zod_1.z.string().nullable(),
    outboundTag: zod_1.z.string().nullable(),
    ts: zod_1.z.number(),
});

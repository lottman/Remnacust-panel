"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileTrafficSchema = void 0;
const zod_1 = require("zod");
const counter = zod_1.z.string().refine(value => /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= 9223372036854775807n, 'Invalid profile traffic counter');
exports.ProfileTrafficSchema = zod_1.z.object({
    capability: zod_1.z.literal('remnacust-profile-traffic-v1'),
    coreProcessId: zod_1.z.uuid(),
    capturedAt: zod_1.z.iso.datetime(),
    bindings: zod_1.z.array(zod_1.z.object({
        bindingUuid: zod_1.z.uuid(),
        uplink: counter,
        downlink: counter,
        available: zod_1.z.boolean(),
        retired: zod_1.z.boolean(),
    })).max(1024),
}).superRefine((value, ctx) => {
    const seen = new Set();
    for (const [index, binding] of value.bindings.entries()) {
        if (seen.has(binding.bindingUuid))
            ctx.addIssue({ code: 'custom', message: 'Duplicate traffic binding', path: ['bindings', index, 'bindingUuid'] });
        seen.add(binding.bindingUuid);
    }
});

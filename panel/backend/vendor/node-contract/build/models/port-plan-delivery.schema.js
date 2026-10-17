"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortPlanTargetSchema = exports.PortPlanDeliverySchema = exports.PortPlanCounterSchema = void 0;
const zod_1 = require("zod");
const counterPattern = /^[1-9][0-9]{0,18}$/;
exports.PortPlanCounterSchema = zod_1.z
    .string()
    .regex(/^[1-9][0-9]{0,18}$/)
    .refine((value) => counterPattern.test(value) && BigInt(value) <= 9223372036854775807n);
exports.PortPlanDeliverySchema = zod_1.z.object({
    epoch: exports.PortPlanCounterSchema,
    owner: zod_1.z.uuid(),
});
exports.PortPlanTargetSchema = zod_1.z.object({
    revision: exports.PortPlanCounterSchema,
    enabled: zod_1.z.boolean(),
    delivery: exports.PortPlanDeliverySchema.optional(),
});

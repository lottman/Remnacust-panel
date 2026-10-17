"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetNodeHealthCheckCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var GetNodeHealthCheckCommand;
(function (GetNodeHealthCheckCommand) {
    GetNodeHealthCheckCommand.url = api_1.REST_API.XRAY.NODE_HEALTH_CHECK;
    GetNodeHealthCheckCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            isAlive: zod_1.z.boolean(),
            xrayInternalStatusCached: zod_1.z.boolean(),
            xrayVersion: zod_1.z.string().nullable(),
            nodeVersion: zod_1.z.string(),
            nativePortPlansSupported: zod_1.z.boolean().optional(),
            profileGraphDeliverySupported: zod_1.z.boolean().optional(),
            portPlanStateSupported: zod_1.z.boolean().optional(),
            portPlanDeliverySupported: zod_1.z.boolean().optional(),
            portPlanDeliveryCapability: zod_1.z.literal('remnacust-port-plan-delivery-v2').optional(),
            portPlanDeliveryEpoch: zod_1.z
                .string()
                .regex(/^(0|[1-9][0-9]{0,18})$/)
                .refine((value) => /^(0|[1-9][0-9]{0,18})$/.test(value) &&
                BigInt(value) <= 9223372036854775807n)
                .optional(),
        }),
    });
})(GetNodeHealthCheckCommand || (exports.GetNodeHealthCheckCommand = GetNodeHealthCheckCommand = {}));

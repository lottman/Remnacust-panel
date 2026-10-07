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
        }),
    });
})(GetNodeHealthCheckCommand || (exports.GetNodeHealthCheckCommand = GetNodeHealthCheckCommand = {}));

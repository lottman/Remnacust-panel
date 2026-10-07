"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetInboundStatsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var GetInboundStatsCommand;
(function (GetInboundStatsCommand) {
    GetInboundStatsCommand.url = api_1.REST_API.STATS.GET_INBOUND_STATS;
    GetInboundStatsCommand.RequestSchema = zod_1.z.object({
        tag: zod_1.z.string(),
        reset: zod_1.z.boolean(),
    });
    GetInboundStatsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            inbound: zod_1.z.string(),
            downlink: zod_1.z.number(),
            uplink: zod_1.z.number(),
        }),
    });
})(GetInboundStatsCommand || (exports.GetInboundStatsCommand = GetInboundStatsCommand = {}));

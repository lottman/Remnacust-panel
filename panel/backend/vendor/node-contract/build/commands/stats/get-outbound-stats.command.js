"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetOutboundStatsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var GetOutboundStatsCommand;
(function (GetOutboundStatsCommand) {
    GetOutboundStatsCommand.url = api_1.REST_API.STATS.GET_OUTBOUND_STATS;
    GetOutboundStatsCommand.RequestSchema = zod_1.z.object({
        tag: zod_1.z.string(),
        reset: zod_1.z.boolean(),
    });
    GetOutboundStatsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            outbound: zod_1.z.string(),
            downlink: zod_1.z.number(),
            uplink: zod_1.z.number(),
        }),
    });
})(GetOutboundStatsCommand || (exports.GetOutboundStatsCommand = GetOutboundStatsCommand = {}));

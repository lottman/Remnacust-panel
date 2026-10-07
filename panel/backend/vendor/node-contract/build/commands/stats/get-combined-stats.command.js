"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetCombinedStatsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var GetCombinedStatsCommand;
(function (GetCombinedStatsCommand) {
    GetCombinedStatsCommand.url = api_1.REST_API.STATS.GET_COMBINED_STATS;
    GetCombinedStatsCommand.RequestSchema = zod_1.z.object({
        reset: zod_1.z.boolean(),
    });
    GetCombinedStatsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            inbounds: zod_1.z.array(zod_1.z.object({
                inbound: zod_1.z.string(),
                downlink: zod_1.z.number(),
                uplink: zod_1.z.number(),
            })),
            outbounds: zod_1.z.array(zod_1.z.object({
                outbound: zod_1.z.string(),
                downlink: zod_1.z.number(),
                uplink: zod_1.z.number(),
            })),
        }),
    });
})(GetCombinedStatsCommand || (exports.GetCombinedStatsCommand = GetCombinedStatsCommand = {}));

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetAllInboundsStatsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var GetAllInboundsStatsCommand;
(function (GetAllInboundsStatsCommand) {
    GetAllInboundsStatsCommand.url = api_1.REST_API.STATS.GET_ALL_INBOUNDS_STATS;
    GetAllInboundsStatsCommand.RequestSchema = zod_1.z.object({
        reset: zod_1.z.boolean(),
    });
    GetAllInboundsStatsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            inbounds: zod_1.z.array(zod_1.z.object({
                inbound: zod_1.z.string(),
                downlink: zod_1.z.number(),
                uplink: zod_1.z.number(),
            })),
        }),
    });
})(GetAllInboundsStatsCommand || (exports.GetAllInboundsStatsCommand = GetAllInboundsStatsCommand = {}));

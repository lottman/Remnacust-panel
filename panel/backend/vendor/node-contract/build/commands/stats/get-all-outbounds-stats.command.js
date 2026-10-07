"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetAllOutboundsStatsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var GetAllOutboundsStatsCommand;
(function (GetAllOutboundsStatsCommand) {
    GetAllOutboundsStatsCommand.url = api_1.REST_API.STATS.GET_ALL_OUTBOUNDS_STATS;
    GetAllOutboundsStatsCommand.RequestSchema = zod_1.z.object({
        reset: zod_1.z.boolean(),
    });
    GetAllOutboundsStatsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            outbounds: zod_1.z.array(zod_1.z.object({
                outbound: zod_1.z.string(),
                downlink: zod_1.z.number(),
                uplink: zod_1.z.number(),
            })),
        }),
    });
})(GetAllOutboundsStatsCommand || (exports.GetAllOutboundsStatsCommand = GetAllOutboundsStatsCommand = {}));

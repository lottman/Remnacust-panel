"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetUsersStatsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var GetUsersStatsCommand;
(function (GetUsersStatsCommand) {
    GetUsersStatsCommand.url = api_1.REST_API.STATS.GET_USERS_STATS;
    GetUsersStatsCommand.RequestSchema = zod_1.z.object({
        reset: zod_1.z.boolean(),
    });
    GetUsersStatsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            users: zod_1.z.array(zod_1.z.object({
                username: zod_1.z.string(),
                downlink: zod_1.z.number(),
                uplink: zod_1.z.number(),
            })),
        }),
    });
})(GetUsersStatsCommand || (exports.GetUsersStatsCommand = GetUsersStatsCommand = {}));

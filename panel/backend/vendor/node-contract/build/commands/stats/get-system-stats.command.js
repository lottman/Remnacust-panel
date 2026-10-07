"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetSystemStatsCommand = void 0;
const zod_1 = require("zod");
const models_1 = require("../../models");
const api_1 = require("../../api");
var GetSystemStatsCommand;
(function (GetSystemStatsCommand) {
    GetSystemStatsCommand.url = api_1.REST_API.STATS.GET_SYSTEM_STATS;
    GetSystemStatsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            xrayInfo: zod_1.z
                .object({
                numGoroutine: zod_1.z.number(),
                numGC: zod_1.z.number(),
                alloc: zod_1.z.number(),
                totalAlloc: zod_1.z.number(),
                sys: zod_1.z.number(),
                mallocs: zod_1.z.number(),
                frees: zod_1.z.number(),
                liveObjects: zod_1.z.number(),
                pauseTotalNs: zod_1.z.number(),
                uptime: zod_1.z.number(),
            })
                .nullable(),
            plugins: zod_1.z.object({
                torrentBlocker: zod_1.z.object({
                    reportsCount: zod_1.z.number(),
                }),
            }),
            system: zod_1.z.object({
                stats: models_1.NodeSystemStatsSchema,
            }),
        }),
    });
})(GetSystemStatsCommand || (exports.GetSystemStatsCommand = GetSystemStatsCommand = {}));

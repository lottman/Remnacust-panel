"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollectReportsCommand = void 0;
const zod_1 = require("zod");
const models_1 = require("../../../models");
const api_1 = require("../../../api");
var CollectReportsCommand;
(function (CollectReportsCommand) {
    CollectReportsCommand.url = api_1.REST_API.PLUGIN.TORRENT_BLOCKER.COLLECT;
    CollectReportsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            reports: zod_1.z.array(models_1.TorrentBlockerReportSchema),
        }),
    });
})(CollectReportsCommand || (exports.CollectReportsCommand = CollectReportsCommand = {}));

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var SyncCommand;
(function (SyncCommand) {
    SyncCommand.url = api_1.REST_API.PLUGIN.SYNC;
    SyncCommand.RequestSchema = zod_1.z.object({
        plugin: zod_1.z
            .object({
            config: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
            uuid: zod_1.z.uuid(),
            name: zod_1.z.string(),
        })
            .nullable(),
    });
    SyncCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            accepted: zod_1.z.boolean(),
        }),
    });
})(SyncCommand || (exports.SyncCommand = SyncCommand = {}));

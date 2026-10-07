"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetUserOnlineStatusCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var GetUserOnlineStatusCommand;
(function (GetUserOnlineStatusCommand) {
    GetUserOnlineStatusCommand.url = api_1.REST_API.STATS.GET_USER_ONLINE_STATUS;
    GetUserOnlineStatusCommand.RequestSchema = zod_1.z.object({
        username: zod_1.z.string(),
    });
    GetUserOnlineStatusCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            isOnline: zod_1.z.boolean(),
        }),
    });
})(GetUserOnlineStatusCommand || (exports.GetUserOnlineStatusCommand = GetUserOnlineStatusCommand = {}));

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoveUsersCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var RemoveUsersCommand;
(function (RemoveUsersCommand) {
    RemoveUsersCommand.url = api_1.REST_API.HANDLER.REMOVE_USERS;
    RemoveUsersCommand.RequestSchema = zod_1.z.object({
        users: zod_1.z.array(zod_1.z.object({
            userId: zod_1.z.string(),
            hashUuid: zod_1.z.uuid(),
        })),
    });
    RemoveUsersCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            success: zod_1.z.boolean(),
            error: zod_1.z.string().nullable(),
        }),
    });
})(RemoveUsersCommand || (exports.RemoveUsersCommand = RemoveUsersCommand = {}));

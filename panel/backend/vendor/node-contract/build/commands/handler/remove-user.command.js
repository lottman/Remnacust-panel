"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoveUserCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var RemoveUserCommand;
(function (RemoveUserCommand) {
    RemoveUserCommand.url = api_1.REST_API.HANDLER.REMOVE_USER;
    RemoveUserCommand.RequestSchema = zod_1.z.object({
        username: zod_1.z.string(),
        hashData: zod_1.z.object({
            vlessUuid: zod_1.z.uuid(),
        }),
    });
    RemoveUserCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            success: zod_1.z.boolean(),
            error: zod_1.z.string().nullable(),
            deviceRevocationSupported: zod_1.z.boolean().optional(),
        }),
    });
})(RemoveUserCommand || (exports.RemoveUserCommand = RemoveUserCommand = {}));

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DropUsersConnectionsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var DropUsersConnectionsCommand;
(function (DropUsersConnectionsCommand) {
    DropUsersConnectionsCommand.url = api_1.REST_API.HANDLER.DROP_USERS_CONNECTIONS;
    DropUsersConnectionsCommand.RequestSchema = zod_1.z.object({
        userIds: zod_1.z.array(zod_1.z.string()).min(1),
    });
    DropUsersConnectionsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            success: zod_1.z.boolean(),
        }),
    });
})(DropUsersConnectionsCommand || (exports.DropUsersConnectionsCommand = DropUsersConnectionsCommand = {}));

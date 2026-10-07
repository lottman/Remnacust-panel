"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetUsersIpListCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var GetUsersIpListCommand;
(function (GetUsersIpListCommand) {
    GetUsersIpListCommand.url = api_1.REST_API.STATS.GET_USERS_IP_LIST;
    GetUsersIpListCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            users: zod_1.z.array(zod_1.z.object({
                userId: zod_1.z.string(),
                ips: zod_1.z.array(zod_1.z.object({
                    ip: zod_1.z.string(),
                    lastSeen: zod_1.z.iso
                        .datetime({
                        local: true,
                        offset: true,
                    })
                        .transform((str) => new Date(str)),
                })),
            })),
        }),
    });
})(GetUsersIpListCommand || (exports.GetUsersIpListCommand = GetUsersIpListCommand = {}));

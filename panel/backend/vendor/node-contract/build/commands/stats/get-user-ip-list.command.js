"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetUserIpListCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var GetUserIpListCommand;
(function (GetUserIpListCommand) {
    GetUserIpListCommand.url = api_1.REST_API.STATS.GET_USER_IP_LIST;
    GetUserIpListCommand.RequestSchema = zod_1.z.object({
        userId: zod_1.z.string(),
    });
    GetUserIpListCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            ips: zod_1.z.array(zod_1.z.object({
                ip: zod_1.z.string(),
                lastSeen: zod_1.z.iso
                    .datetime({ local: true, offset: true })
                    .transform((str) => new Date(str)),
            })),
        }),
    });
})(GetUserIpListCommand || (exports.GetUserIpListCommand = GetUserIpListCommand = {}));

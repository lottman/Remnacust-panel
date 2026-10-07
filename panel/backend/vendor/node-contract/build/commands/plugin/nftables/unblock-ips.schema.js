"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnblockIpsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../../api");
var UnblockIpsCommand;
(function (UnblockIpsCommand) {
    UnblockIpsCommand.url = api_1.REST_API.PLUGIN.NFTABLES.UNBLOCK_IPS;
    UnblockIpsCommand.RequestSchema = zod_1.z.object({
        ips: zod_1.z.array(zod_1.z.union([zod_1.z.ipv4(), zod_1.z.ipv6()])),
    });
    UnblockIpsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            accepted: zod_1.z.boolean(),
        }),
    });
})(UnblockIpsCommand || (exports.UnblockIpsCommand = UnblockIpsCommand = {}));

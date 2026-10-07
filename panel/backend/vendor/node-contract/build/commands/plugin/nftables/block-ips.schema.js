"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockIpsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../../api");
var BlockIpsCommand;
(function (BlockIpsCommand) {
    BlockIpsCommand.url = api_1.REST_API.PLUGIN.NFTABLES.BLOCK_IPS;
    BlockIpsCommand.RequestSchema = zod_1.z.object({
        ips: zod_1.z.array(zod_1.z.object({
            ip: zod_1.z.union([zod_1.z.ipv4(), zod_1.z.ipv6()]),
            timeout: zod_1.z.number(),
        })),
    });
    BlockIpsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            accepted: zod_1.z.boolean(),
        }),
    });
})(BlockIpsCommand || (exports.BlockIpsCommand = BlockIpsCommand = {}));

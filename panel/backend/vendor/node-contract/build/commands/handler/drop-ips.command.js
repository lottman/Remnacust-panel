"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DropIpsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var DropIpsCommand;
(function (DropIpsCommand) {
    DropIpsCommand.url = api_1.REST_API.HANDLER.DROP_IPS;
    DropIpsCommand.RequestSchema = zod_1.z.object({
        ips: zod_1.z.array(zod_1.z.string()).min(1),
    });
    DropIpsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            success: zod_1.z.boolean(),
        }),
    });
})(DropIpsCommand || (exports.DropIpsCommand = DropIpsCommand = {}));

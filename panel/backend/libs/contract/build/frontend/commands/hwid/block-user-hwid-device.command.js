"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockUserHwidDeviceCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
const models_1 = require("../../models");
var BlockUserHwidDeviceCommand;
(function (BlockUserHwidDeviceCommand) {
    BlockUserHwidDeviceCommand.url = api_1.REST_API.HWID.BLOCK_USER_HWID_DEVICE;
    BlockUserHwidDeviceCommand.TSQ_url = BlockUserHwidDeviceCommand.url;
    BlockUserHwidDeviceCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.HWID_ROUTES.BLOCK_USER_HWID_DEVICE, 'post', 'Block a user HWID device', { scope: 'block', kind: 'write' });
    BlockUserHwidDeviceCommand.RequestBodySchema = zod_1.z.object({
        userId: zod_1.z.number(),
        hwid: zod_1.z.string(),
    });
    BlockUserHwidDeviceCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            total: zod_1.z.number(),
            devices: zod_1.z.array(models_1.HwidUserDeviceSchema),
        }),
    });
})(BlockUserHwidDeviceCommand || (exports.BlockUserHwidDeviceCommand = BlockUserHwidDeviceCommand = {}));

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnblockUserHwidDeviceCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
const models_1 = require("../../models");
var UnblockUserHwidDeviceCommand;
(function (UnblockUserHwidDeviceCommand) {
    UnblockUserHwidDeviceCommand.url = api_1.REST_API.HWID.UNBLOCK_USER_HWID_DEVICE;
    UnblockUserHwidDeviceCommand.TSQ_url = UnblockUserHwidDeviceCommand.url;
    UnblockUserHwidDeviceCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.HWID_ROUTES.UNBLOCK_USER_HWID_DEVICE, 'post', 'Unblock a user HWID device', { scope: 'unblock', kind: 'write' });
    UnblockUserHwidDeviceCommand.RequestBodySchema = zod_1.z.object({
        userId: zod_1.z.number(),
        hwid: zod_1.z.string(),
    });
    UnblockUserHwidDeviceCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            total: zod_1.z.number(),
            devices: zod_1.z.array(models_1.HwidUserDeviceSchema),
        }),
    });
})(UnblockUserHwidDeviceCommand || (exports.UnblockUserHwidDeviceCommand = UnblockUserHwidDeviceCommand = {}));

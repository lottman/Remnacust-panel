"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetGeocheckCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var GetGeocheckCommand;
(function (GetGeocheckCommand) {
    GetGeocheckCommand.url = api_1.REST_API.STATS.GET_GEOCHECK;
    GetGeocheckCommand.RequestSchema = zod_1.z.object({
        ip: zod_1.z.string().optional(),
        interface: zod_1.z.string().optional(),
    });
    GetGeocheckCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.looseObject({
            image: zod_1.z.object({
                format: zod_1.z.literal('svg'),
                media_type: zod_1.z.literal('image/svg+xml'),
                encoding: zod_1.z.literal('base64'),
                data: zod_1.z.string(),
            }),
        }),
    });
})(GetGeocheckCommand || (exports.GetGeocheckCommand = GetGeocheckCommand = {}));

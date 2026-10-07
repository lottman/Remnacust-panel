"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StopXrayCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var StopXrayCommand;
(function (StopXrayCommand) {
    StopXrayCommand.url = api_1.REST_API.XRAY.STOP;
    StopXrayCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            isStopped: zod_1.z.boolean(),
        }),
    });
})(StopXrayCommand || (exports.StopXrayCommand = StopXrayCommand = {}));

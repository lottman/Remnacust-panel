"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateHwidRegistrationCommand = exports.GetHwidRegistrationCommand = void 0;
const zod_1 = require("zod");
const constants_1 = require("../../constants");
const params = zod_1.z.object({ userId: zod_1.z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER) });
const response = zod_1.z.object({ response: zod_1.z.object({ userId: zod_1.z.number().int(), registrationAllowed: zod_1.z.boolean() }) });
var GetHwidRegistrationCommand;
(function (GetHwidRegistrationCommand) {
    GetHwidRegistrationCommand.url = (userId) => `/api/hwid/devices/registration/${userId}`;
    GetHwidRegistrationCommand.TSQ_url = GetHwidRegistrationCommand.url(':userId');
    GetHwidRegistrationCommand.endpointDetails = (0, constants_1.getEndpointDetails)('devices/registration/:userId', 'get', 'Get new device registration policy', { scope: 'registration-get', kind: 'read' });
    GetHwidRegistrationCommand.RequestParamSchema = params;
    GetHwidRegistrationCommand.ResponseSchema = response;
})(GetHwidRegistrationCommand || (exports.GetHwidRegistrationCommand = GetHwidRegistrationCommand = {}));
var UpdateHwidRegistrationCommand;
(function (UpdateHwidRegistrationCommand) {
    UpdateHwidRegistrationCommand.url = GetHwidRegistrationCommand.url;
    UpdateHwidRegistrationCommand.TSQ_url = GetHwidRegistrationCommand.TSQ_url;
    UpdateHwidRegistrationCommand.endpointDetails = (0, constants_1.getEndpointDetails)('devices/registration/:userId', 'patch', 'Allow or deny new device registration without changing the device limit', { scope: 'registration-update', kind: 'write' });
    UpdateHwidRegistrationCommand.RequestParamSchema = params;
    UpdateHwidRegistrationCommand.RequestBodySchema = zod_1.z.object({ registrationAllowed: zod_1.z.boolean() }).strict();
    UpdateHwidRegistrationCommand.ResponseSchema = response;
})(UpdateHwidRegistrationCommand || (exports.UpdateHwidRegistrationCommand = UpdateHwidRegistrationCommand = {}));

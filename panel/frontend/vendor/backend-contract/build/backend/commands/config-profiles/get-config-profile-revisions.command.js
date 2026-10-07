"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetConfigProfileRevisionsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
var GetConfigProfileRevisionsCommand;
(function (GetConfigProfileRevisionsCommand) {
    GetConfigProfileRevisionsCommand.url = api_1.REST_API.CONFIG_PROFILES.GET_REVISIONS;
    GetConfigProfileRevisionsCommand.TSQ_url = GetConfigProfileRevisionsCommand.url(':uuid');
    GetConfigProfileRevisionsCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.CONFIG_PROFILES_ROUTES.GET_REVISIONS(':uuid'), 'get', 'Get saved config profile revisions', { scope: 'get-revisions', kind: 'read' });
    GetConfigProfileRevisionsCommand.RequestParamSchema = zod_1.z.object({ uuid: zod_1.z.uuid() });
    GetConfigProfileRevisionsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.array(zod_1.z.object({
            uuid: zod_1.z.uuid(),
            name: zod_1.z.string(),
            config: zod_1.z.unknown(),
            createdAt: zod_1.z.iso.datetime(),
        })),
    });
})(GetConfigProfileRevisionsCommand || (exports.GetConfigProfileRevisionsCommand = GetConfigProfileRevisionsCommand = {}));

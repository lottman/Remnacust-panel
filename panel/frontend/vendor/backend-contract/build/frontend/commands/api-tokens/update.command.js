"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateApiTokenCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
const api_tokens_schema_1 = require("../../models/api-tokens.schema");
var UpdateApiTokenCommand;
(function (UpdateApiTokenCommand) {
    UpdateApiTokenCommand.url = api_1.REST_API.API_TOKENS.UPDATE;
    UpdateApiTokenCommand.TSQ_url = UpdateApiTokenCommand.url(':uuid');
    UpdateApiTokenCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.API_TOKENS_ROUTES.UPDATE(':uuid'), 'patch', 'Update API token name and permissions', { scope: 'update', kind: 'write' }, 'Admin session only. The token value and expiration do not change. Current permissions apply on the next request.');
    UpdateApiTokenCommand.RequestParamSchema = zod_1.z.object({ uuid: zod_1.z.uuid() });
    UpdateApiTokenCommand.RequestBodySchema = zod_1.z.object({
        name: zod_1.z.string().trim().min(2).max(30),
        scopes: zod_1.z.array(zod_1.z.string().min(1).max(120)).max(512),
    }).strict();
    UpdateApiTokenCommand.ResponseSchema = zod_1.z.object({ response: api_tokens_schema_1.ApiTokensSchema });
})(UpdateApiTokenCommand || (exports.UpdateApiTokenCommand = UpdateApiTokenCommand = {}));

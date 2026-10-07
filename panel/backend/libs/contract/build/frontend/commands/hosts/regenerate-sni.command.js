"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegenerateHostSniCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
const host_response_1 = require("./host.response");
var RegenerateHostSniCommand;
(function (RegenerateHostSniCommand) {
    RegenerateHostSniCommand.url = api_1.REST_API.HOSTS.ACTIONS.REGENERATE_SNI;
    RegenerateHostSniCommand.TSQ_url = RegenerateHostSniCommand.url;
    RegenerateHostSniCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.HOSTS_ROUTES.ACTIONS.REGENERATE_SNI, 'post', 'Regenerate host SNI and short ids now', { scope: 'regenerate-sni', kind: 'write' });
    RegenerateHostSniCommand.RequestBodySchema = zod_1.z.object({
        uuid: zod_1.z.uuid(),
    });
    RegenerateHostSniCommand.ResponseSchema = host_response_1.HostResponseSchema;
})(RegenerateHostSniCommand || (exports.RegenerateHostSniCommand = RegenerateHostSniCommand = {}));

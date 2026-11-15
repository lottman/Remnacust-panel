"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RescanNodeIpsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../../api");
const constants_1 = require("../../../constants");
const node_response_1 = require("../node.response");
var RescanNodeIpsCommand;
(function (RescanNodeIpsCommand) {
    RescanNodeIpsCommand.url = api_1.REST_API.NODES.ACTIONS.RESCAN_IPS;
    RescanNodeIpsCommand.TSQ_url = RescanNodeIpsCommand.url(':uuid');
    RescanNodeIpsCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.NODES_ROUTES.ACTIONS.RESCAN_IPS(':uuid'), 'post', 'Rescan assigned IPv4 and IPv6 addresses', { scope: 'rescan-ips', kind: 'write' });
    RescanNodeIpsCommand.RequestParamSchema = zod_1.z.object({ uuid: zod_1.z.uuid() });
    RescanNodeIpsCommand.RequestBodySchema = zod_1.z.object({ controlRevision: zod_1.z.uuid() });
    RescanNodeIpsCommand.ResponseSchema = node_response_1.NodeResponseSchema;
})(RescanNodeIpsCommand || (exports.RescanNodeIpsCommand = RescanNodeIpsCommand = {}));

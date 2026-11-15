"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetNetworkAddressesCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const models_1 = require("../../models");
var GetNetworkAddressesCommand;
(function (GetNetworkAddressesCommand) {
    GetNetworkAddressesCommand.url = api_1.REST_API.STATS.GET_NETWORK_ADDRESSES;
    GetNetworkAddressesCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            addresses: models_1.NetworkAddressesSchema,
            complete: zod_1.z.literal(true),
        }),
    });
})(GetNetworkAddressesCommand || (exports.GetNetworkAddressesCommand = GetNetworkAddressesCommand = {}));

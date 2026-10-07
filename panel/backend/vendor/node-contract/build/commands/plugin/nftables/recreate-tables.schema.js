"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecreateTablesCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../../api");
var RecreateTablesCommand;
(function (RecreateTablesCommand) {
    RecreateTablesCommand.url = api_1.REST_API.PLUGIN.NFTABLES.RECREATE_TABLES;
    RecreateTablesCommand.ResponseSchema = zod_1.z.object({ response: zod_1.z.object({ accepted: zod_1.z.boolean() }) });
})(RecreateTablesCommand || (exports.RecreateTablesCommand = RecreateTablesCommand = {}));

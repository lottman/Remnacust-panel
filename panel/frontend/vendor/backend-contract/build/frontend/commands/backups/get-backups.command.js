"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetBackupsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
const models_1 = require("../../models");
var GetBackupsCommand;
(function (GetBackupsCommand) {
    GetBackupsCommand.url = api_1.REST_API.BACKUPS.LIST;
    GetBackupsCommand.TSQ_url = GetBackupsCommand.url;
    GetBackupsCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.BACKUPS_ROUTES.LIST, 'get', 'Get all database backups', { scope: 'list', kind: 'read' });
    GetBackupsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            backups: zod_1.z.array(models_1.BackupFileSchema),
        }),
    });
})(GetBackupsCommand || (exports.GetBackupsCommand = GetBackupsCommand = {}));

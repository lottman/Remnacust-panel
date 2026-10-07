"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetBackupSettingsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
const models_1 = require("../../models");
var GetBackupSettingsCommand;
(function (GetBackupSettingsCommand) {
    GetBackupSettingsCommand.url = api_1.REST_API.BACKUPS.SETTINGS;
    GetBackupSettingsCommand.TSQ_url = GetBackupSettingsCommand.url;
    GetBackupSettingsCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.BACKUPS_ROUTES.SETTINGS, 'get', 'Get backup settings', { scope: 'settings-get', kind: 'read' });
    GetBackupSettingsCommand.ResponseSchema = zod_1.z.object({
        response: models_1.BackupSettingsSchema,
    });
})(GetBackupSettingsCommand || (exports.GetBackupSettingsCommand = GetBackupSettingsCommand = {}));

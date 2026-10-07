"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateBackupSettingsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
const models_1 = require("../../models");
var UpdateBackupSettingsCommand;
(function (UpdateBackupSettingsCommand) {
    UpdateBackupSettingsCommand.url = api_1.REST_API.BACKUPS.SETTINGS_UPDATE;
    UpdateBackupSettingsCommand.TSQ_url = UpdateBackupSettingsCommand.url;
    UpdateBackupSettingsCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.BACKUPS_ROUTES.SETTINGS_UPDATE, 'patch', 'Update backup settings', { scope: 'settings-update', kind: 'write' });
    UpdateBackupSettingsCommand.RequestBodySchema = models_1.BackupSettingsSchema.partial();
    UpdateBackupSettingsCommand.ResponseSchema = zod_1.z.object({
        response: models_1.BackupSettingsSchema,
    });
})(UpdateBackupSettingsCommand || (exports.UpdateBackupSettingsCommand = UpdateBackupSettingsCommand = {}));

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateBackupCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
const models_1 = require("../../models");
var CreateBackupCommand;
(function (CreateBackupCommand) {
    CreateBackupCommand.url = api_1.REST_API.BACKUPS.CREATE;
    CreateBackupCommand.TSQ_url = CreateBackupCommand.url;
    CreateBackupCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.BACKUPS_ROUTES.CREATE, 'post', 'Create a database backup now', { scope: 'create', kind: 'write' });
    CreateBackupCommand.RequestBodySchema = zod_1.z.object({});
    CreateBackupCommand.ResponseSchema = zod_1.z.object({
        response: models_1.BackupFileSchema,
    });
})(CreateBackupCommand || (exports.CreateBackupCommand = CreateBackupCommand = {}));

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteBackupCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
const models_1 = require("../../models");
var DeleteBackupCommand;
(function (DeleteBackupCommand) {
    DeleteBackupCommand.url = api_1.REST_API.BACKUPS.DELETE;
    DeleteBackupCommand.TSQ_url = DeleteBackupCommand.url;
    DeleteBackupCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.BACKUPS_ROUTES.DELETE, 'post', 'Delete a database backup', { scope: 'delete', kind: 'write' });
    DeleteBackupCommand.RequestBodySchema = zod_1.z.object({
        filename: zod_1.z.string().regex(/^[A-Za-z0-9._-]+$/),
    });
    DeleteBackupCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            backups: zod_1.z.array(models_1.BackupFileSchema),
        }),
    });
})(DeleteBackupCommand || (exports.DeleteBackupCommand = DeleteBackupCommand = {}));

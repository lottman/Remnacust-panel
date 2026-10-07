"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SendBackupCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
var SendBackupCommand;
(function (SendBackupCommand) {
    SendBackupCommand.url = api_1.REST_API.BACKUPS.SEND;
    SendBackupCommand.TSQ_url = SendBackupCommand.url;
    SendBackupCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.BACKUPS_ROUTES.SEND, 'post', 'Send a database backup to the Telegram chat', { scope: 'send', kind: 'write' });
    SendBackupCommand.RequestBodySchema = zod_1.z.object({
        filename: zod_1.z.string().regex(/^[A-Za-z0-9._-]+$/),
    });
    SendBackupCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            delivered: zod_1.z.boolean(),
        }),
    });
})(SendBackupCommand || (exports.SendBackupCommand = SendBackupCommand = {}));

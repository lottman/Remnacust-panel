"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportUsersCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
var ExportUsersCommand;
(function (ExportUsersCommand) {
    ExportUsersCommand.url = api_1.REST_API.USERS.EXPORT;
    ExportUsersCommand.TSQ_url = ExportUsersCommand.url;
    ExportUsersCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.USERS_ROUTES.EXPORT, 'get', 'Export all users with their keys for migration to another panel', { scope: 'export', kind: 'read' });
    ExportUsersCommand.RequestQuerySchema = zod_1.z.object({
        squadUuid: zod_1.z.uuid().optional(),
    });
    ExportUsersCommand.ExportedUserSchema = zod_1.z.object({
        username: zod_1.z.string(),
        shortUuid: zod_1.z.string(),
        vlessUuid: zod_1.z.string(),
        trojanPassword: zod_1.z.string(),
        ssPassword: zod_1.z.string(),
        status: zod_1.z.string().nullable(),
        trafficLimitBytes: zod_1.z.number().nullable(),
        trafficLimitStrategy: zod_1.z.string().nullable(),
        expireAt: zod_1.z.string().nullable(),
        createdAt: zod_1.z.string().nullable(),
        hwidDeviceLimit: zod_1.z.number().nullable(),
        tag: zod_1.z.string().nullable(),
        description: zod_1.z.string().nullable(),
        email: zod_1.z.string().nullable(),
        telegramId: zod_1.z.number().nullable(),
        activeInternalSquads: zod_1.z.array(zod_1.z.string()).default([]),
    });
    ExportUsersCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            users: zod_1.z.array(ExportUsersCommand.ExportedUserSchema),
            exportedAt: zod_1.z.iso.datetime(),
        }),
    });
})(ExportUsersCommand || (exports.ExportUsersCommand = ExportUsersCommand = {}));

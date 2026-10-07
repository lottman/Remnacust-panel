"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportUsersCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
const create_user_command_1 = require("./create-user.command");
var ImportUsersCommand;
(function (ImportUsersCommand) {
    ImportUsersCommand.url = api_1.REST_API.USERS.IMPORT;
    ImportUsersCommand.TSQ_url = ImportUsersCommand.url;
    ImportUsersCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.USERS_ROUTES.IMPORT, 'post', 'Import users from an exported file, preserving their keys', { scope: 'import', kind: 'write' });
    ImportUsersCommand.RequestBodySchema = zod_1.z.object({
        users: zod_1.z
            .array(create_user_command_1.CreateUserCommand.RequestBodySchema.extend({
            status: create_user_command_1.CreateUserCommand.RequestBodySchema.shape.status.nullish(),
            trafficLimitBytes: create_user_command_1.CreateUserCommand.RequestBodySchema.shape.trafficLimitBytes.nullish(),
            trafficLimitStrategy: create_user_command_1.CreateUserCommand.RequestBodySchema.shape.trafficLimitStrategy.nullish(),
            expireAt: zod_1.z.iso.datetime({ offset: true, local: true }).nullable(),
            createdAt: zod_1.z.iso.datetime({ offset: true, local: true }).nullish(),
            hwidDeviceLimit: create_user_command_1.CreateUserCommand.RequestBodySchema.shape.hwidDeviceLimit.nullish(),
            tag: create_user_command_1.CreateUserCommand.RequestBodySchema.shape.tag.nullish(),
            description: create_user_command_1.CreateUserCommand.RequestBodySchema.shape.description.nullish(),
            email: create_user_command_1.CreateUserCommand.RequestBodySchema.shape.email.nullish(),
            telegramId: create_user_command_1.CreateUserCommand.RequestBodySchema.shape.telegramId.nullish(),
            activeInternalSquads: zod_1.z.array(zod_1.z.string()).optional().describe('Internal squad names from the exported file, resolved against existing squads in the destination panel. Not squad UUIDs.'),
        }))
            .min(1)
            .max(20000),
        defaultInternalSquadUuid: zod_1.z.uuid().nullish(),
    });
    ImportUsersCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            created: zod_1.z.number(),
            skipped: zod_1.z.number(),
            failed: zod_1.z.number(),
            errors: zod_1.z.array(zod_1.z.object({
                username: zod_1.z.string(),
                error: zod_1.z.string(),
            })),
        }),
    });
})(ImportUsersCommand || (exports.ImportUsersCommand = ImportUsersCommand = {}));

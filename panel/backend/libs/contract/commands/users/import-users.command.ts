import { z } from 'zod';

import { USERS_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';
import { CreateUserCommand } from './create-user.command';

export namespace ImportUsersCommand {
    export const url = REST_API.USERS.IMPORT;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        USERS_ROUTES.IMPORT,
        'post',
        'Import users from an exported file, preserving their keys',
        { scope: 'import', kind: 'write' },
    );

    export const RequestBodySchema = z.object({
        users: z
            .array(CreateUserCommand.RequestBodySchema.extend({
                status: CreateUserCommand.RequestBodySchema.shape.status.nullish(),
                trafficLimitBytes: CreateUserCommand.RequestBodySchema.shape.trafficLimitBytes.nullish(),
                trafficLimitStrategy: CreateUserCommand.RequestBodySchema.shape.trafficLimitStrategy.nullish(),
                expireAt: z.iso.datetime({ offset: true, local: true }).nullable(),
                createdAt: z.iso.datetime({ offset: true, local: true }).nullish(),
                hwidDeviceLimit: CreateUserCommand.RequestBodySchema.shape.hwidDeviceLimit.nullish(),
                tag: CreateUserCommand.RequestBodySchema.shape.tag.nullish(),
                description: CreateUserCommand.RequestBodySchema.shape.description.nullish(),
                email: CreateUserCommand.RequestBodySchema.shape.email.nullish(),
                telegramId: CreateUserCommand.RequestBodySchema.shape.telegramId.nullish(),
                activeInternalSquads: z.array(z.string()).optional().describe(
                    'Internal squad names from the exported file, resolved against existing squads in the destination panel. Not squad UUIDs.',
                ),
            }))
            .min(1)
            .max(20000),
        defaultInternalSquadUuid: z.uuid().nullish(),
    });

    export const ResponseSchema = z.object({
        response: z.object({
            created: z.number(),
            skipped: z.number(),
            failed: z.number(),
            errors: z.array(
                z.object({
                    username: z.string(),
                    error: z.string(),
                }),
            ),
        }),
    });

    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}

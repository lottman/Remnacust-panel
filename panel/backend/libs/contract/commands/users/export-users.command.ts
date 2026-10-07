import { z } from 'zod';

import { USERS_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';

export namespace ExportUsersCommand {
    export const url = REST_API.USERS.EXPORT;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        USERS_ROUTES.EXPORT,
        'get',
        'Export all users with their keys for migration to another panel',
        { scope: 'export', kind: 'read' },
    );

    export const RequestQuerySchema = z.object({
        squadUuid: z.uuid().optional(),
    });

    export const ExportedUserSchema = z.object({
        username: z.string(),
        shortUuid: z.string(),
        vlessUuid: z.string(),
        trojanPassword: z.string(),
        ssPassword: z.string(),
        status: z.string().nullable(),
        trafficLimitBytes: z.number().nullable(),
        trafficLimitStrategy: z.string().nullable(),
        expireAt: z.string().nullable(),
        createdAt: z.string().nullable(),
        hwidDeviceLimit: z.number().nullable(),
        tag: z.string().nullable(),
        description: z.string().nullable(),
        email: z.string().nullable(),
        telegramId: z.number().nullable(),
        activeInternalSquads: z.array(z.string()).default([]),
    });

    export const ResponseSchema = z.object({
        response: z.object({
            users: z.array(ExportedUserSchema),
            exportedAt: z.iso.datetime(),
        }),
    });

    export type ExportedUser = z.infer<typeof ExportedUserSchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}

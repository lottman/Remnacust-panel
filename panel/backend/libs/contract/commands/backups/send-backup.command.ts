import { z } from 'zod';

import { BACKUPS_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';

export namespace SendBackupCommand {
    export const url = REST_API.BACKUPS.SEND;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        BACKUPS_ROUTES.SEND,
        'post',
        'Send a database backup to the Telegram chat',
        { scope: 'send', kind: 'write' },
    );

    export const RequestBodySchema = z.object({
        filename: z.string().regex(/^[A-Za-z0-9._-]+$/),
    });

    export const ResponseSchema = z.object({
        response: z.object({
            delivered: z.boolean(),
        }),
    });

    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}

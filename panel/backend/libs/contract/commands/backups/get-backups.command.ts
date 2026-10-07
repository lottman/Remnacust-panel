import { z } from 'zod';

import { BACKUPS_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';
import { BackupFileSchema } from '../../models';

export namespace GetBackupsCommand {
    export const url = REST_API.BACKUPS.LIST;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        BACKUPS_ROUTES.LIST,
        'get',
        'Get all database backups',
        { scope: 'list', kind: 'read' },
    );

    export const ResponseSchema = z.object({
        response: z.object({
            backups: z.array(BackupFileSchema),
        }),
    });

    export type Response = z.infer<typeof ResponseSchema>;
}

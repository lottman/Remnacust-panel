import { z } from 'zod';

import { BACKUPS_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';
import { BackupFileSchema } from '../../models';

export namespace CreateBackupCommand {
    export const url = REST_API.BACKUPS.CREATE;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        BACKUPS_ROUTES.CREATE,
        'post',
        'Create a database backup now',
        { scope: 'create', kind: 'write' },
    );

    export const RequestBodySchema = z.object({});

    export type RequestBody = z.infer<typeof RequestBodySchema>;

    export const ResponseSchema = z.object({
        response: BackupFileSchema,
    });

    export type Response = z.infer<typeof ResponseSchema>;
}

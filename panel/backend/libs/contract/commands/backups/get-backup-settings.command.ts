import { z } from 'zod';

import { BACKUPS_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';
import { BackupSettingsSchema } from '../../models';

export namespace GetBackupSettingsCommand {
    export const url = REST_API.BACKUPS.SETTINGS;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        BACKUPS_ROUTES.SETTINGS,
        'get',
        'Get backup settings',
        { scope: 'settings-get', kind: 'read' },
    );

    export const ResponseSchema = z.object({
        response: BackupSettingsSchema,
    });

    export type Response = z.infer<typeof ResponseSchema>;
}

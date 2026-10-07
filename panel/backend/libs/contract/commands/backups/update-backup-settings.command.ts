import { z } from 'zod';

import { BACKUPS_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';
import { BackupSettingsSchema } from '../../models';

export namespace UpdateBackupSettingsCommand {
    export const url = REST_API.BACKUPS.SETTINGS_UPDATE;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        BACKUPS_ROUTES.SETTINGS_UPDATE,
        'patch',
        'Update backup settings',
        { scope: 'settings-update', kind: 'write' },
    );

    export const RequestBodySchema = BackupSettingsSchema.partial();

    export const ResponseSchema = z.object({
        response: BackupSettingsSchema,
    });

    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}

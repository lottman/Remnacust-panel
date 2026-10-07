import { z } from 'zod';

import { REMNAWAVE_SETTINGS_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';
import { RemnawaveSettingsSchema } from '../../models';

export namespace GetRemnawaveSettingsCommand {
    export const url = REST_API.REMNAAWAVE_SETTINGS.GET;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        REMNAWAVE_SETTINGS_ROUTES.GET,
        'get',
        'Get Remnawave settings',
        { scope: 'get', kind: 'read' },
    );

    export const ResponseSchema = z.object({
        response: RemnawaveSettingsSchema,
    });

    export type Response = z.infer<typeof ResponseSchema>;
}

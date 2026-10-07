import { z } from 'zod';

import { REMNAWAVE_SETTINGS_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';
import {
    BrandingSettingsSchema,
    Oauth2SettingsSchema,
    PasskeySettingsSchema,
    PasswordAuthSettingsSchema,
    RemnawaveSettingsSchema,
} from '../../models';

export namespace UpdateRemnawaveSettingsCommand {
    export const url = REST_API.REMNAAWAVE_SETTINGS.UPDATE;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        REMNAWAVE_SETTINGS_ROUTES.UPDATE,
        'patch',
        'Update Remnawave settings',
        { scope: 'update', kind: 'write' },
    );

    export const RequestBodySchema = z.object({
        passkeySettings: PasskeySettingsSchema.optional(),
        oauth2Settings: Oauth2SettingsSchema.optional(),
        passwordSettings: PasswordAuthSettingsSchema.optional(),
        brandingSettings: BrandingSettingsSchema.optional(),
    });

    export const ResponseSchema = z.object({
        response: RemnawaveSettingsSchema,
    });

    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}

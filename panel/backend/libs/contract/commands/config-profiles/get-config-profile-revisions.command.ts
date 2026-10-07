import { z } from 'zod';

import { CONFIG_PROFILES_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';

export namespace GetConfigProfileRevisionsCommand {
    export const url = REST_API.CONFIG_PROFILES.GET_REVISIONS;
    export const TSQ_url = url(':uuid');
    export const endpointDetails = getEndpointDetails(
        CONFIG_PROFILES_ROUTES.GET_REVISIONS(':uuid'),
        'get',
        'Get saved config profile revisions',
        { scope: 'get-revisions', kind: 'read' },
    );
    export const RequestParamSchema = z.object({ uuid: z.uuid() });
    export const ResponseSchema = z.object({
        response: z.array(z.object({
            uuid: z.uuid(),
            name: z.string(),
            config: z.unknown(),
            createdAt: z.iso.datetime(),
        })),
    });
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}

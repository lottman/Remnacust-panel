import { z } from 'zod';

import { API_TOKENS_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';
import { ApiTokensSchema } from '../../models/api-tokens.schema';

export namespace UpdateApiTokenCommand {
    export const url = REST_API.API_TOKENS.UPDATE;
    export const TSQ_url = url(':uuid');
    export const endpointDetails = getEndpointDetails(
        API_TOKENS_ROUTES.UPDATE(':uuid'), 'patch', 'Update API token name and permissions',
        { scope: 'update', kind: 'write' },
        'Admin session only. The token value and expiration do not change. Current permissions apply on the next request.',
    );
    export const RequestParamSchema = z.object({ uuid: z.uuid() });
    export const RequestBodySchema = z.object({
        name: z.string().trim().min(2).max(30),
        scopes: z.array(z.string().min(1).max(120)).max(512),
    }).strict();
    export const ResponseSchema = z.object({ response: ApiTokensSchema });
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}

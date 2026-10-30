import { z } from 'zod';

import { REST_API, API_TOKENS_ROUTES } from '../../api';
import { getEndpointDetails } from '../../constants';
import { ApiTokensSchema } from '../../models/api-tokens.schema';

export namespace CreateApiTokenCommand {
    export const url = REST_API.API_TOKENS.CREATE;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        API_TOKENS_ROUTES.CREATE,
        'post',
        'Create a new API token',
        { scope: 'create', kind: 'write' },
        'This endpoint is forbidden to use via "API-key". It can only be used with an admin JWT-token.',
    );

    export const RequestBodySchema = z.object({
        name: z.string().trim().min(2).max(30).describe('Name of the API token'),
        expiresInDays: z.number().int().min(1).max(365000).nullable()
            .describe('Expiration in whole days; null explicitly creates a token without expiration'),
        scopes: z.array(z.string().min(1).max(120)).max(512).optional().default([]).describe('Explicit scopes of the API token; omitted scopes grant no access'),
    });

    export const ResponseSchema = z.object({
        response: ApiTokensSchema.extend({
            token: z.string(),
        }),
    });

    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}

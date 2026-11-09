import { z } from 'zod';

import { REST_API, SUBSCRIPTION_DOMAINS_ROUTES } from '../../api';
import { getEndpointDetails } from '../../constants';
import {
    SubscriptionDomainInputSchema,
    SubscriptionDomainSchema,
} from '../../models/subscription-domain.schema';
export namespace ListSubscriptionDomainsCommand {
    export const url = REST_API.SUBSCRIPTION_DOMAINS.GET_ALL;
    export const TSQ_url = url;
    export const endpointDetails = getEndpointDetails('', 'get', 'List subscription domains', {
        scope: 'list',
        kind: 'read',
    });
    export const RequestQuerySchema = z
        .object({
            kind: z.enum(['PRIMARY', 'CDN']).optional(),
            parentUuid: z.uuid().optional(),
        })
        .strict()
        .refine((value) => !(value.kind === 'PRIMARY' && value.parentUuid), {
            message: 'A parent filter applies only to CDN domains',
            path: ['parentUuid'],
        });
    export type RequestQuery = z.infer<typeof RequestQuerySchema>;
    export const ResponseSchema = z.object({
        response: z.array(SubscriptionDomainSchema),
        environment: z.enum(['synced', 'unavailable', 'invalid', 'conflict']).optional(),
    });
}
export namespace GetSubscriptionDomainCommand {
    export const url = REST_API.SUBSCRIPTION_DOMAINS.GET(':uuid');
    export const TSQ_url = url;
    export const endpointDetails = getEndpointDetails(
        SUBSCRIPTION_DOMAINS_ROUTES.GET(':uuid'),
        'get',
        'Get a subscription domain by UUID',
        { scope: 'get', kind: 'read' },
    );
    export const ResponseSchema = z.object({ response: SubscriptionDomainSchema });
}
export namespace CreateSubscriptionDomainCommand {
    export const url = REST_API.SUBSCRIPTION_DOMAINS.CREATE;
    export const TSQ_url = url;
    export const endpointDetails = getEndpointDetails(
        '',
        'post',
        'Register a subscription domain',
        { scope: 'create', kind: 'write' },
    );
    export const RequestBodySchema = SubscriptionDomainInputSchema;
    export const ResponseSchema = GetSubscriptionDomainCommand.ResponseSchema;
}
export namespace UpdateSubscriptionDomainCommand {
    export const url = REST_API.SUBSCRIPTION_DOMAINS.UPDATE(':uuid');
    export const TSQ_url = url;
    export const endpointDetails = getEndpointDetails(
        SUBSCRIPTION_DOMAINS_ROUTES.UPDATE(':uuid'),
        'patch',
        'Update a subscription domain',
        { scope: 'update', kind: 'write' },
    );
    export const RequestBodySchema = SubscriptionDomainInputSchema;
    export const ResponseSchema = GetSubscriptionDomainCommand.ResponseSchema;
}
export namespace DeleteSubscriptionDomainCommand {
    export const url = REST_API.SUBSCRIPTION_DOMAINS.DELETE(':uuid');
    export const TSQ_url = url;
    export const endpointDetails = getEndpointDetails(
        SUBSCRIPTION_DOMAINS_ROUTES.DELETE(':uuid'),
        'delete',
        'Delete a subscription domain with optional user reassignment',
        { scope: 'delete', kind: 'write' },
    );
    export const RequestQuerySchema = z
        .object({
            reassignUsers: z
                .enum(['true', 'false'])
                .transform((value) => value === 'true')
                .optional(),
        })
        .strict();
    export type RequestQuery = z.infer<typeof RequestQuerySchema>;
}

export namespace GetSubscriptionDomainCredentialsCommand {
    export const url = '/api/subscription-domains/:uuid/credentials';
    export const TSQ_url = url;
    export const endpointDetails = getEndpointDetails(
        ':uuid/credentials',
        'post',
        'Get private CDN origin credentials',
        { scope: 'credentials', kind: 'write' },
    );
    export const ResponseSchema = z.object({
        response: z.object({
            requestHeaderName: z.string().regex(/^X-[a-f0-9]{24}$/),
            requestHeaderValue: z.string().max(101),
        }),
    });
}

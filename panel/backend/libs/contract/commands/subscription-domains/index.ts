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
    export const ResponseSchema = z.object({ response: z.array(SubscriptionDomainSchema) });
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
        'Delete an unused subscription domain',
        { scope: 'delete', kind: 'write' },
    );
}

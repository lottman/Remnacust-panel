import { z } from 'zod';

import { REST_API, USERS_ROUTES } from '../../api';
import { getEndpointDetails } from '../../constants';
import { numberParamSchema } from '../../models';

const params = z.object({ userId: numberParamSchema });
const domainQuery = z.object({ domainUuid: z.uuid().optional() }).strict();
const linksResponse = z.object({
    response: z.object({
        primaryDomainUuid: z.uuid(),
        links: z
            .array(
                z.object({
                    domainUuid: z.uuid(),
                    name: z.string(),
                    domain: z.string(),
                    kind: z.enum(['PRIMARY', 'CDN']),
                    url: z.url(),
                    isSelected: z.boolean(),
                }),
            )
            .max(128),
    }),
});

export namespace GetUserDomainLinksCommand {
    export const url = REST_API.USERS.SUBSCRIPTION_LINKS;
    export const TSQ_url = url(':userId');
    export const endpointDetails = getEndpointDetails(
        USERS_ROUTES.SUBSCRIPTION_LINKS(':userId'),
        'get',
        'Get user subscription links for the primary domain and its CDNs',
        { scope: 'subscription-links', kind: 'read' },
    );
    export const RequestParamSchema = params;
    export const RequestQuerySchema = domainQuery.extend({
        kind: z.enum(['PRIMARY', 'CDN']).optional(),
    });
    export const ResponseSchema = linksResponse;
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type RequestQuery = z.infer<typeof RequestQuerySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}
export namespace GetUserPrimaryDomainLinkCommand {
    export const url = REST_API.USERS.SUBSCRIPTION_LINKS_PRIMARY;
    export const TSQ_url = url(':userId');
    export const endpointDetails = getEndpointDetails(
        USERS_ROUTES.SUBSCRIPTION_LINKS_PRIMARY(':userId'),
        'get',
        'Get only the user primary subscription domain link',
        { scope: 'subscription-links-primary', kind: 'read' },
    );
    export const RequestParamSchema = params;
    export const RequestQuerySchema = domainQuery;
    export const ResponseSchema = linksResponse;
    export type RequestQuery = z.infer<typeof RequestQuerySchema>;
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}
export namespace GetUserCdnDomainLinksCommand {
    export const url = REST_API.USERS.SUBSCRIPTION_LINKS_CDN;
    export const TSQ_url = url(':userId');
    export const endpointDetails = getEndpointDetails(
        USERS_ROUTES.SUBSCRIPTION_LINKS_CDN(':userId'),
        'get',
        'Get only the user CDN subscription domain links',
        { scope: 'subscription-links-cdn', kind: 'read' },
    );
    export const RequestParamSchema = params;
    export const RequestQuerySchema = domainQuery;
    export const ResponseSchema = linksResponse;
    export type RequestQuery = z.infer<typeof RequestQuerySchema>;
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}

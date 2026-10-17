import { z } from 'zod';

import { REST_API, SUBSCRIPTION_TEMPLATE_ROUTES } from '../../api';
import { getEndpointDetails } from '../../constants';

export namespace GetSubscriptionTemplateRevisionsCommand {
    export const url = REST_API.SUBSCRIPTION_TEMPLATE.GET_REVISIONS;
    export const TSQ_url = url(':uuid');
    export const endpointDetails = getEndpointDetails(
        SUBSCRIPTION_TEMPLATE_ROUTES.GET_REVISIONS(':uuid'),
        'get',
        'Get the latest 30 saved subscription template revisions',
        { scope: 'get-revisions', kind: 'read' },
    );
    export const RequestParamSchema = z.object({ uuid: z.uuid() });
    export const ResponseSchema = z.object({
        response: z.array(
            z.object({
                uuid: z.uuid(),
                name: z.string(),
                templateJson: z.unknown().nullable(),
                encodedTemplateYaml: z.string().nullable(),
                createdAt: z.iso.datetime(),
            }),
        ),
    });
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}

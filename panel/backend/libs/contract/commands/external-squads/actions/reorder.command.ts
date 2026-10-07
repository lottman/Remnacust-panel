import { z } from 'zod';

import { EXTERNAL_SQUADS_ROUTES, REST_API } from '../../../api';
import { getEndpointDetails } from '../../../constants';
import { ExternalSquadSchema } from '../../../models';

export namespace ReorderExternalSquadCommand {
    export const url = REST_API.EXTERNAL_SQUADS.ACTIONS.REORDER;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        EXTERNAL_SQUADS_ROUTES.ACTIONS.REORDER,
        'post',
        'Reorder external squads',
        { scope: 'reorder', kind: 'write' },
    );

    export const RequestBodySchema = z.object({
        items: z.array(
            z.object({
                uuid: z.uuid(),
                viewPosition: z.int(),
            }),
        ),
    });

    export const ResponseSchema = z.object({
        response: z.object({
            total: z.number(),
            externalSquads: z.array(ExternalSquadSchema),
        }),
    });

    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}

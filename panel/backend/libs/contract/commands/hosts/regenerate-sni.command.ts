import { z } from 'zod';

import { HOSTS_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';
import { HostResponseSchema } from './host.response';

export namespace RegenerateHostSniCommand {
    export const url = REST_API.HOSTS.ACTIONS.REGENERATE_SNI;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        HOSTS_ROUTES.ACTIONS.REGENERATE_SNI,
        'post',
        'Regenerate host SNI and short ids now',
        { scope: 'regenerate-sni', kind: 'write' },
    );

    export const RequestBodySchema = z.object({
        uuid: z.uuid(),
    });

    export const ResponseSchema = HostResponseSchema;

    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}

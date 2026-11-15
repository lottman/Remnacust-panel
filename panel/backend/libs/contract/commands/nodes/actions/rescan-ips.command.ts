import { z } from 'zod';

import { NODES_ROUTES, REST_API } from '../../../api';
import { getEndpointDetails } from '../../../constants';
import { NodeResponseSchema } from '../node.response';

export namespace RescanNodeIpsCommand {
    export const url = REST_API.NODES.ACTIONS.RESCAN_IPS;
    export const TSQ_url = url(':uuid');
    export const endpointDetails = getEndpointDetails(
        NODES_ROUTES.ACTIONS.RESCAN_IPS(':uuid'),
        'post',
        'Rescan assigned IPv4 and IPv6 addresses',
        { scope: 'rescan-ips', kind: 'write' },
    );
    export const RequestParamSchema = z.object({ uuid: z.uuid() });
    export const RequestBodySchema = z.object({ controlRevision: z.uuid() });
    export const ResponseSchema = NodeResponseSchema;
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}

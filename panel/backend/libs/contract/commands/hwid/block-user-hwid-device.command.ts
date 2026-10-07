import { z } from 'zod';

import { HWID_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';
import { HwidUserDeviceSchema } from '../../models';

export namespace BlockUserHwidDeviceCommand {
    export const url = REST_API.HWID.BLOCK_USER_HWID_DEVICE;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        HWID_ROUTES.BLOCK_USER_HWID_DEVICE,
        'post',
        'Block a user HWID device',
        { scope: 'block', kind: 'write' },
    );

    export const RequestBodySchema = z.object({
        userId: z.number(),
        hwid: z.string(),
    });

    export const ResponseSchema = z.object({
        response: z.object({
            total: z.number(),
            devices: z.array(HwidUserDeviceSchema),
        }),
    });

    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}

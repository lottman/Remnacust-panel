import { z } from 'zod';

import { REST_API, USERS_ROUTES } from '../../../api';
import { getEndpointDetails } from '../../../constants';
import { numberParamSchema } from '../../../models';
import { UserResponseSchema } from '../user.response';

export namespace ExtendUserCommand {
    export const url = REST_API.USERS.ACTIONS.EXTEND_EXPIRATION_DATE;
    export const TSQ_url = url(':userId');

    export const endpointDetails = getEndpointDetails(
        USERS_ROUTES.ACTIONS.EXTEND_EXPIRATION_DATE(':userId'),
        'post',
        'Extend user expiration date',
        { scope: 'extend', kind: 'write' },
        'EXPIRED users are extended from the current date and become ACTIVE. FROZEN users retain their paused status and the added days increase their remaining lifetime. ACTIVE, DISABLED and LIMITED users are extended without changing status.',
    );

    export const RequestParamSchema = z.object({
        userId: numberParamSchema,
    });

    export const RequestBodySchema = z.object({
        days: z.number().min(1).describe('The number of days to extend the expiration date.'),
    });

    export const ResponseSchema = UserResponseSchema;

    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}

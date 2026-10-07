import { z } from 'zod';
import { getEndpointDetails } from '../../constants';
const params = z.object({userId:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER)});
const response = z.object({response:z.object({userId:z.number().int(),registrationAllowed:z.boolean()})});
export namespace GetHwidRegistrationCommand {
    export const url = (userId: number | string) => `/api/hwid/devices/registration/${userId}`;
    export const TSQ_url = url(':userId');
    export const endpointDetails = getEndpointDetails('devices/registration/:userId','get','Get new device registration policy',{scope:'registration-get',kind:'read'});
    export const RequestParamSchema = params;
    export const ResponseSchema = response;
    export type RequestParam = z.infer<typeof params>;
    export type Response = z.infer<typeof response>;
}
export namespace UpdateHwidRegistrationCommand {
    export const url = GetHwidRegistrationCommand.url;
    export const TSQ_url = GetHwidRegistrationCommand.TSQ_url;
    export const endpointDetails = getEndpointDetails('devices/registration/:userId','patch','Allow or deny new device registration without changing the device limit',{scope:'registration-update',kind:'write'});
    export const RequestParamSchema = params;
    export const RequestBodySchema = z.object({registrationAllowed:z.boolean()}).strict();
    export const ResponseSchema = response;
    export type RequestParam = z.infer<typeof params>;
    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof response>;
}

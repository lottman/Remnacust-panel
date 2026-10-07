import { z } from 'zod';
declare const params: z.ZodObject<{
    userId: z.ZodCoercedNumber<unknown>;
}, z.core.$strip>;
declare const response: z.ZodObject<{
    response: z.ZodObject<{
        userId: z.ZodNumber;
        registrationAllowed: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare namespace GetHwidRegistrationCommand {
    const url: (userId: number | string) => string;
    const TSQ_url: string;
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestParamSchema: z.ZodObject<{
        userId: z.ZodCoercedNumber<unknown>;
    }, z.core.$strip>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            userId: z.ZodNumber;
            registrationAllowed: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type RequestParam = z.infer<typeof params>;
    type Response = z.infer<typeof response>;
}
export declare namespace UpdateHwidRegistrationCommand {
    const url: (userId: number | string) => string;
    const TSQ_url: string;
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestParamSchema: z.ZodObject<{
        userId: z.ZodCoercedNumber<unknown>;
    }, z.core.$strip>;
    const RequestBodySchema: z.ZodObject<{
        registrationAllowed: z.ZodBoolean;
    }, z.core.$strict>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            userId: z.ZodNumber;
            registrationAllowed: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type RequestParam = z.infer<typeof params>;
    type RequestBody = z.infer<typeof RequestBodySchema>;
    type Response = z.infer<typeof response>;
}
export {};
//# sourceMappingURL=registration.command.d.ts.map
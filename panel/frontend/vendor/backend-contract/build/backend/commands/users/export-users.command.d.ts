import { z } from 'zod';
export declare namespace ExportUsersCommand {
    const url: "/api/users/export";
    const TSQ_url: "/api/users/export";
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestQuerySchema: z.ZodObject<{
        squadUuid: z.ZodOptional<z.ZodUUID>;
    }, z.core.$strip>;
    const ExportedUserSchema: z.ZodObject<{
        username: z.ZodString;
        shortUuid: z.ZodString;
        vlessUuid: z.ZodString;
        trojanPassword: z.ZodString;
        ssPassword: z.ZodString;
        status: z.ZodNullable<z.ZodString>;
        trafficLimitBytes: z.ZodNullable<z.ZodNumber>;
        trafficLimitStrategy: z.ZodNullable<z.ZodString>;
        expireAt: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodNullable<z.ZodString>;
        hwidDeviceLimit: z.ZodNullable<z.ZodNumber>;
        tag: z.ZodNullable<z.ZodString>;
        description: z.ZodNullable<z.ZodString>;
        email: z.ZodNullable<z.ZodString>;
        telegramId: z.ZodNullable<z.ZodNumber>;
        activeInternalSquads: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            users: z.ZodArray<z.ZodObject<{
                username: z.ZodString;
                shortUuid: z.ZodString;
                vlessUuid: z.ZodString;
                trojanPassword: z.ZodString;
                ssPassword: z.ZodString;
                status: z.ZodNullable<z.ZodString>;
                trafficLimitBytes: z.ZodNullable<z.ZodNumber>;
                trafficLimitStrategy: z.ZodNullable<z.ZodString>;
                expireAt: z.ZodNullable<z.ZodString>;
                createdAt: z.ZodNullable<z.ZodString>;
                hwidDeviceLimit: z.ZodNullable<z.ZodNumber>;
                tag: z.ZodNullable<z.ZodString>;
                description: z.ZodNullable<z.ZodString>;
                email: z.ZodNullable<z.ZodString>;
                telegramId: z.ZodNullable<z.ZodNumber>;
                activeInternalSquads: z.ZodDefault<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>>;
            exportedAt: z.ZodISODateTime;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type ExportedUser = z.infer<typeof ExportedUserSchema>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=export-users.command.d.ts.map
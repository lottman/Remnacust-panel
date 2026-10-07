import { z } from 'zod';
export declare namespace ImportUsersCommand {
    const url: "/api/users/import";
    const TSQ_url: "/api/users/import";
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestBodySchema: z.ZodObject<{
        users: z.ZodArray<z.ZodObject<{
            username: z.ZodString;
            shortUuid: z.ZodOptional<z.ZodString>;
            trojanPassword: z.ZodOptional<z.ZodString>;
            vlessUuid: z.ZodOptional<z.ZodGUID>;
            ssPassword: z.ZodOptional<z.ZodString>;
            lastTrafficResetAt: z.ZodOptional<z.ZodPipe<z.ZodISODateTime, z.ZodTransform<Date, string>>>;
            externalSquadUuid: z.ZodOptional<z.ZodNullable<z.ZodUUID>>;
            status: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodDefault<z.ZodEnum<{
                readonly ACTIVE: "ACTIVE";
                readonly DISABLED: "DISABLED";
                readonly LIMITED: "LIMITED";
                readonly EXPIRED: "EXPIRED";
            }>>>>>;
            trafficLimitBytes: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodNumber>>>;
            trafficLimitStrategy: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodDefault<z.ZodEnum<{
                readonly NO_RESET: "NO_RESET";
                readonly DAY: "DAY";
                readonly WEEK: "WEEK";
                readonly MONTH: "MONTH";
                readonly MONTH_ROLLING: "MONTH_ROLLING";
            }>>>>>;
            expireAt: z.ZodNullable<z.ZodISODateTime>;
            createdAt: z.ZodOptional<z.ZodNullable<z.ZodISODateTime>>;
            hwidDeviceLimit: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodInt>>>;
            tag: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodNullable<z.ZodString>>>>;
            description: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
            email: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodNullable<z.ZodEmail>>>>;
            telegramId: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>>;
            activeInternalSquads: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
        defaultInternalSquadUuid: z.ZodOptional<z.ZodNullable<z.ZodUUID>>;
    }, z.core.$strip>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            created: z.ZodNumber;
            skipped: z.ZodNumber;
            failed: z.ZodNumber;
            errors: z.ZodArray<z.ZodObject<{
                username: z.ZodString;
                error: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type RequestBody = z.infer<typeof RequestBodySchema>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=import-users.command.d.ts.map
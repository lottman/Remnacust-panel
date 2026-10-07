import { z } from 'zod';
export declare namespace UpdateBackupSettingsCommand {
    const url: "/api/backups/settings";
    const TSQ_url: "/api/backups/settings";
    const endpointDetails: import("../../constants").EndpointDetails;
    const RequestBodySchema: z.ZodObject<{
        autoMode: z.ZodOptional<z.ZodPreprocess<z.ZodDefault<z.ZodEnum<{
            OFF: "OFF";
            DAILY: "DAILY";
        }>>, unknown>>;
        intervalHours: z.ZodOptional<z.ZodDefault<z.ZodInt>>;
        retentionDays: z.ZodOptional<z.ZodDefault<z.ZodInt>>;
        sendToTelegram: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        telegramBotToken: z.ZodOptional<z.ZodDefault<z.ZodNullable<z.ZodString>>>;
        telegramChatId: z.ZodOptional<z.ZodDefault<z.ZodNullable<z.ZodString>>>;
    }, z.core.$strip>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            autoMode: z.ZodPreprocess<z.ZodDefault<z.ZodEnum<{
                OFF: "OFF";
                DAILY: "DAILY";
            }>>, unknown>;
            intervalHours: z.ZodDefault<z.ZodInt>;
            retentionDays: z.ZodDefault<z.ZodInt>;
            sendToTelegram: z.ZodDefault<z.ZodBoolean>;
            telegramBotToken: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            telegramChatId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type RequestBody = z.infer<typeof RequestBodySchema>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=update-backup-settings.command.d.ts.map
import { z } from 'zod';
export declare namespace GetBackupSettingsCommand {
    const url: "/api/backups/settings";
    const TSQ_url: "/api/backups/settings";
    const endpointDetails: import("../../constants").EndpointDetails;
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
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-backup-settings.command.d.ts.map
import { z } from 'zod';
export declare const BackupSettingsSchema: z.ZodObject<{
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
export type TBackupSettings = z.infer<typeof BackupSettingsSchema>;
export declare const BackupFileSchema: z.ZodObject<{
    filename: z.ZodString;
    sizeBytes: z.ZodNumber;
    createdAt: z.ZodPipe<z.ZodISODateTime, z.ZodTransform<Date, string>>;
}, z.core.$strip>;
export type TBackupFile = z.infer<typeof BackupFileSchema>;
//# sourceMappingURL=backup-settings.schema.d.ts.map
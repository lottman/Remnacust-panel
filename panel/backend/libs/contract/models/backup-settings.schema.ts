import { z } from 'zod';

export const BackupSettingsSchema = z.object({
    autoMode: z.preprocess(
        (value) => value === 'WEEKLY' ? 'DAILY' : value,
        z.enum(['OFF', 'DAILY']).default('OFF'),
    ),
    intervalHours: z.int().min(1).max(168).default(24),
    retentionDays: z.int().min(1).max(7).default(7),
    sendToTelegram: z.boolean().default(false),
    telegramBotToken: z.string().trim().max(200).nullable().default(null),
    telegramChatId: z.string().trim().max(64).nullable().default(null),
});

export type TBackupSettings = z.infer<typeof BackupSettingsSchema>;

export const BackupFileSchema = z.object({
    filename: z.string(),
    sizeBytes: z.number(),
    createdAt: z.iso.datetime().transform((str) => new Date(str)),
});

export type TBackupFile = z.infer<typeof BackupFileSchema>;

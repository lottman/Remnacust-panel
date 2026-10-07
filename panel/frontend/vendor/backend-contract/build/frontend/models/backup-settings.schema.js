"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupFileSchema = exports.BackupSettingsSchema = void 0;
const zod_1 = require("zod");
exports.BackupSettingsSchema = zod_1.z.object({
    autoMode: zod_1.z.preprocess((value) => value === 'WEEKLY' ? 'DAILY' : value, zod_1.z.enum(['OFF', 'DAILY']).default('OFF')),
    intervalHours: zod_1.z.int().min(1).max(168).default(24),
    retentionDays: zod_1.z.int().min(1).max(7).default(7),
    sendToTelegram: zod_1.z.boolean().default(false),
    telegramBotToken: zod_1.z.string().trim().max(200).nullable().default(null),
    telegramChatId: zod_1.z.string().trim().max(64).nullable().default(null),
});
exports.BackupFileSchema = zod_1.z.object({
    filename: zod_1.z.string(),
    sizeBytes: zod_1.z.number(),
    createdAt: zod_1.z.iso.datetime().transform((str) => new Date(str)),
});

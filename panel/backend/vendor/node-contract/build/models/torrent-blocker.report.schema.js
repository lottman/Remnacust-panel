"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TorrentBlockerReportSchema = void 0;
const zod_1 = __importDefault(require("zod"));
const xray_webhook_schema_1 = require("./xray-webhook.schema");
exports.TorrentBlockerReportSchema = zod_1.default.object({
    actionReport: zod_1.default.object({
        blocked: zod_1.default.boolean(),
        ip: zod_1.default.string(),
        blockDuration: zod_1.default.number(),
        willUnblockAt: zod_1.default
            .string()
            .datetime({ offset: true, local: true })
            .transform((str) => new Date(str)),
        userId: zod_1.default.string(),
        processedAt: zod_1.default
            .string()
            .datetime({ offset: true, local: true })
            .transform((str) => new Date(str)),
    }),
    xrayReport: xray_webhook_schema_1.XrayWebhookSchema,
});

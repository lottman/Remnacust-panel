import { z } from 'zod';
export declare const XrayWebhookSchema: z.ZodObject<{
    email: z.ZodNullable<z.ZodString>;
    level: z.ZodNullable<z.ZodNumber>;
    protocol: z.ZodNullable<z.ZodString>;
    network: z.ZodString;
    source: z.ZodNullable<z.ZodString>;
    destination: z.ZodString;
    routeTarget: z.ZodNullable<z.ZodString>;
    originalTarget: z.ZodNullable<z.ZodString>;
    inboundTag: z.ZodNullable<z.ZodString>;
    inboundName: z.ZodNullable<z.ZodString>;
    inboundLocal: z.ZodNullable<z.ZodString>;
    outboundTag: z.ZodNullable<z.ZodString>;
    ts: z.ZodNumber;
}, z.core.$strip>;
export type XrayWebhookModel = z.infer<typeof XrayWebhookSchema>;
//# sourceMappingURL=xray-webhook.schema.d.ts.map
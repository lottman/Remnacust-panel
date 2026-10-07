import { z } from 'zod';
export declare namespace GetGeocheckCommand {
    const url: "/node/stats/get-geocheck";
    const RequestSchema: z.ZodObject<{
        ip: z.ZodOptional<z.ZodString>;
        interface: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    type Request = z.infer<typeof RequestSchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            image: z.ZodObject<{
                format: z.ZodLiteral<"svg">;
                media_type: z.ZodLiteral<"image/svg+xml">;
                encoding: z.ZodLiteral<"base64">;
                data: z.ZodString;
            }, z.core.$strip>;
        }, z.core.$loose>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=get-geocheck.command.d.ts.map
import { z } from 'zod';
export declare enum CipherType {
    AES_128_GCM = 5,
    AES_256_GCM = 6,
    CHACHA20_POLY1305 = 7,
    NONE = 9,
    UNKNOWN = 0,
    UNRECOGNIZED = -1,
    XCHACHA20_POLY1305 = 8
}
export declare namespace AddUserCommand {
    const url: "/node/handler/add-user";
    const RequestSchema: z.ZodObject<{
        data: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<"trojan">;
            tag: z.ZodString;
            username: z.ZodString;
            password: z.ZodString;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"vless">;
            tag: z.ZodString;
            username: z.ZodString;
            uuid: z.ZodString;
            flow: z.ZodEnum<{
                "": "";
                "xtls-rprx-vision": "xtls-rprx-vision";
            }>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"shadowsocks">;
            tag: z.ZodString;
            username: z.ZodString;
            password: z.ZodString;
            cipherType: z.ZodEnum<typeof CipherType>;
            ivCheck: z.ZodBoolean;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"shadowsocks22">;
            tag: z.ZodString;
            username: z.ZodString;
            password: z.ZodString;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"hysteria">;
            tag: z.ZodString;
            username: z.ZodString;
            password: z.ZodString;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"masque">;
            tag: z.ZodString;
            username: z.ZodString;
            password: z.ZodString;
        }, z.core.$strip>], "type">>;
        hashData: z.ZodObject<{
            vlessUuid: z.ZodUUID;
            prevVlessUuid: z.ZodOptional<z.ZodUUID>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Request = z.infer<typeof RequestSchema>;
    const ResponseSchema: z.ZodObject<{
        response: z.ZodObject<{
            success: z.ZodBoolean;
            error: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    type Response = z.infer<typeof ResponseSchema>;
}
//# sourceMappingURL=add-user.command.d.ts.map
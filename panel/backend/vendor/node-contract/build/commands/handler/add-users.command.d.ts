import { z } from 'zod';
export declare namespace AddUsersCommand {
    const url: "/node/handler/add-users";
    const RequestSchema: z.ZodObject<{
        affectedInboundTags: z.ZodArray<z.ZodString>;
        users: z.ZodArray<z.ZodObject<{
            inboundData: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                type: z.ZodLiteral<"trojan">;
                tag: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"vless">;
                tag: z.ZodString;
                flow: z.ZodEnum<{
                    "": "";
                    "xtls-rprx-vision": "xtls-rprx-vision";
                }>;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"shadowsocks">;
                tag: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"shadowsocks22">;
                tag: z.ZodString;
                password: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"hysteria">;
                tag: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"masque">;
                tag: z.ZodString;
            }, z.core.$strip>], "type">>;
            userData: z.ZodObject<{
                userId: z.ZodString;
                hashUuid: z.ZodUUID;
                vlessUuid: z.ZodUUID;
                trojanPassword: z.ZodString;
                ssPassword: z.ZodString;
            }, z.core.$strip>;
        }, z.core.$strip>>;
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
//# sourceMappingURL=add-users.command.d.ts.map
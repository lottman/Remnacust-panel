"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddUserCommand = exports.CipherType = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var CipherType;
(function (CipherType) {
    CipherType[CipherType["AES_128_GCM"] = 5] = "AES_128_GCM";
    CipherType[CipherType["AES_256_GCM"] = 6] = "AES_256_GCM";
    CipherType[CipherType["CHACHA20_POLY1305"] = 7] = "CHACHA20_POLY1305";
    CipherType[CipherType["UNKNOWN"] = 0] = "UNKNOWN";
    CipherType[CipherType["UNRECOGNIZED"] = -1] = "UNRECOGNIZED";
    CipherType[CipherType["XCHACHA20_POLY1305"] = 8] = "XCHACHA20_POLY1305";
})(CipherType || (exports.CipherType = CipherType = {}));
var AddUserCommand;
(function (AddUserCommand) {
    AddUserCommand.url = api_1.REST_API.HANDLER.ADD_USER;
    const BaseTrojanUser = zod_1.z.object({
        type: zod_1.z.literal('trojan'),
        tag: zod_1.z.string(),
        username: zod_1.z.string(),
        password: zod_1.z.string(),
    });
    const BaseVlessUser = zod_1.z.object({
        type: zod_1.z.literal('vless'),
        tag: zod_1.z.string(),
        username: zod_1.z.string(),
        uuid: zod_1.z.string(),
        flow: zod_1.z.enum(['xtls-rprx-vision', '']),
    });
    const BaseShadowsocksUser = zod_1.z.object({
        type: zod_1.z.literal('shadowsocks'),
        tag: zod_1.z.string(),
        username: zod_1.z.string(),
        password: zod_1.z.string(),
        cipherType: zod_1.z.enum(CipherType),
        ivCheck: zod_1.z.boolean(),
    });
    const BaseShadowsocks22User = zod_1.z.object({
        type: zod_1.z.literal('shadowsocks22'),
        tag: zod_1.z.string(),
        username: zod_1.z.string(),
        password: zod_1.z.string(),
    });
    const BaseHysteriaUser = zod_1.z.object({
        type: zod_1.z.literal('hysteria'),
        tag: zod_1.z.string(),
        username: zod_1.z.string(),
        password: zod_1.z.string(),
    });
    const BaseMasqueUser = zod_1.z.object({
        type: zod_1.z.literal('masque'),
        tag: zod_1.z.string(),
        username: zod_1.z.string(),
        password: zod_1.z.string(),
    });
    AddUserCommand.RequestSchema = zod_1.z.object({
        data: zod_1.z.array(zod_1.z.discriminatedUnion('type', [
            BaseTrojanUser,
            BaseVlessUser,
            BaseShadowsocksUser,
            BaseShadowsocks22User,
            BaseHysteriaUser,
            BaseMasqueUser,
        ])),
        hashData: zod_1.z.object({
            vlessUuid: zod_1.z.uuid(),
            prevVlessUuid: zod_1.z.optional(zod_1.z.uuid()),
        }),
    });
    AddUserCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            success: zod_1.z.boolean(),
            error: zod_1.z.string().nullable(),
        }),
    });
})(AddUserCommand || (exports.AddUserCommand = AddUserCommand = {}));

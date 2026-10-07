"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddUsersCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
var AddUsersCommand;
(function (AddUsersCommand) {
    AddUsersCommand.url = api_1.REST_API.HANDLER.ADD_USERS;
    const BaseTrojanUser = zod_1.z.object({
        type: zod_1.z.literal('trojan'),
        tag: zod_1.z.string(),
    });
    const BaseVlessUser = zod_1.z.object({
        type: zod_1.z.literal('vless'),
        tag: zod_1.z.string(),
        flow: zod_1.z.enum(['xtls-rprx-vision', '']),
    });
    const BaseShadowsocksUser = zod_1.z.object({
        type: zod_1.z.literal('shadowsocks'),
        tag: zod_1.z.string(),
    });
    const BaseShadowsocks22User = zod_1.z.object({
        type: zod_1.z.literal('shadowsocks22'),
        tag: zod_1.z.string(),
        // Per-inbound key supports mixed AES-128/AES-256 profiles. Old callers remain compatible.
        password: zod_1.z.string().min(1).optional(),
    });
    const BaseHysteriaUser = zod_1.z.object({
        type: zod_1.z.literal('hysteria'),
        tag: zod_1.z.string(),
    });
    const BaseMasqueUser = zod_1.z.object({
        type: zod_1.z.literal('masque'),
        tag: zod_1.z.string(),
    });
    AddUsersCommand.RequestSchema = zod_1.z.object({
        affectedInboundTags: zod_1.z.array(zod_1.z.string()),
        users: zod_1.z.array(zod_1.z.object({
            inboundData: zod_1.z.array(zod_1.z.discriminatedUnion('type', [
                BaseTrojanUser,
                BaseVlessUser,
                BaseShadowsocksUser,
                BaseShadowsocks22User,
                BaseHysteriaUser,
                BaseMasqueUser,
            ])),
            userData: zod_1.z.object({
                userId: zod_1.z.string(),
                hashUuid: zod_1.z.uuid(),
                vlessUuid: zod_1.z.uuid(),
                trojanPassword: zod_1.z.string(),
                ssPassword: zod_1.z.string(),
            }),
        })),
    });
    AddUsersCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            success: zod_1.z.boolean(),
            error: zod_1.z.string().nullable(),
        }),
    });
})(AddUsersCommand || (exports.AddUsersCommand = AddUsersCommand = {}));

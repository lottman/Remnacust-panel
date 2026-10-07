"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StartXrayCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const models_1 = require("../../models");
var StartXrayCommand;
(function (StartXrayCommand) {
    StartXrayCommand.url = api_1.REST_API.XRAY.START;
    StartXrayCommand.RequestSchema = zod_1.z.object({
        internals: zod_1.z.object({
            metadata: models_1.NodeMetadataSchema.optional(),
            integrations: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
            forceRestart: zod_1.z.boolean().default(false),
            hashes: zod_1.z.object({
                emptyConfig: zod_1.z.string(),
                inbounds: zod_1.z.array(zod_1.z.object({
                    usersCount: zod_1.z.number(),
                    hash: zod_1.z.string(),
                    tag: zod_1.z.string(),
                })),
            }),
        }),
        xrayConfig: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    });
    StartXrayCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            isStarted: zod_1.z.boolean(),
            version: zod_1.z.string().nullable(),
            error: zod_1.z.string().nullable(),
            nodeInformation: zod_1.z.object({
                version: zod_1.z.string().nullable(),
            }),
            system: models_1.NodeSystemSchema,
        }),
    });
})(StartXrayCommand || (exports.StartXrayCommand = StartXrayCommand = {}));

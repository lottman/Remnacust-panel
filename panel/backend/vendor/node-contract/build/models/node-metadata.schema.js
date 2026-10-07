"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeMetadataSchema = void 0;
const zod_1 = require("zod");
exports.NodeMetadataSchema = zod_1.z.object({
    name: zod_1.z.string(),
    uuid: zod_1.z.string(),
    id: zod_1.z.number(),
    tags: zod_1.z.array(zod_1.z.string()),
    countryCode: zod_1.z.string(),
});

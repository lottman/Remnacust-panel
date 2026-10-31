"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtendedUsersSchema = void 0;
const zod_1 = require("zod");
const base_internal_squad_schema_1 = require("./base-internal-squad.schema");
const user_traffic_schema_1 = require("./user-traffic.schema");
const users_schema_1 = require("./users.schema");
exports.ExtendedUsersSchema = users_schema_1.UsersSchema.extend({
    subscriptionUrl: zod_1.z.string(),
    subscriptionDomain: zod_1.z
        .object({
        uuid: zod_1.z.uuid(),
        name: zod_1.z.string(),
        domain: zod_1.z.string(),
        path: zod_1.z.string(),
        kind: zod_1.z.enum(['PRIMARY', 'CDN']),
        parentUuid: zod_1.z.uuid().nullable(),
        isDefault: zod_1.z.boolean(),
    })
        .nullable()
        .optional(),
    activeInternalSquads: zod_1.z.array(base_internal_squad_schema_1.BaseInternalSquadSchema),
    userTraffic: user_traffic_schema_1.UserTrafficSchema,
});

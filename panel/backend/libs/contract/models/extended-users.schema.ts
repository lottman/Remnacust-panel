import { z } from 'zod';

import { BaseInternalSquadSchema } from './base-internal-squad.schema';
import { UserTrafficSchema } from './user-traffic.schema';
import { UsersSchema } from './users.schema';

export const ExtendedUsersSchema = UsersSchema.extend({
    subscriptionUrl: z.string(),
    subscriptionDomain: z
        .object({
            uuid: z.uuid(),
            name: z.string(),
            domain: z.string(),
            path: z.string(),
            kind: z.enum(['PRIMARY', 'CDN']),
            parentUuid: z.uuid().nullable(),
            isDefault: z.boolean(),
        })
        .nullable()
        .optional(),
    activeInternalSquads: z.array(BaseInternalSquadSchema),
    userTraffic: UserTrafficSchema,
});

import { z } from 'zod';

export const ApiTokensSchema = z.object({
    uuid: z.uuid(),
    name: z.string(),
    expireAt: z.iso.datetime()
        .transform((str) => new Date(str)).nullable(),
    scopes: z.array(z.string()),
    createdAt: z.iso.datetime()
        .transform((str) => new Date(str)),
    updatedAt: z.iso.datetime()
        .transform((str) => new Date(str)),
});

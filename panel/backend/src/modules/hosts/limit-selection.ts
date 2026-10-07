import { sql } from 'kysely';
import { z } from 'zod';

export const limitSelectionSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('ALL') }).strict(),
    z
        .object({
            type: z.literal('SELECTED'),
            userIds: z
                .array(
                    z
                        .string()
                        .refine(
                            (id) =>
                                /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n,
                        ),
                )
                .min(1)
                .max(500)
                .transform((ids) => [...new Set(ids)].sort()),
        })
        .strict(),
    z
        .object({
            type: z.literal('SQUAD'),
            squadType: z.enum(['INTERNAL', 'EXTERNAL']),
            squadUuid: z.uuid().transform((id) => id.toLowerCase()),
        })
        .strict(),
]);
export type LimitSelection = z.infer<typeof limitSelectionSchema>;

// Used both for listing recipients and for the transactional mutation. Search and
// pagination never form part of the action's recipient selection.
export function limitSelectionPredicate(selection: LimitSelection) {
    if (selection.type === 'SELECTED')
        return sql`u.id IN (${sql.join(selection.userIds.map((id) => sql`${id}::bigint`))})`;
    if (selection.type === 'SQUAD')
        return selection.squadType === 'INTERNAL'
            ? sql`EXISTS(SELECT 1 FROM internal_squad_members m WHERE m.user_id=u.id AND m.internal_squad_uuid=${selection.squadUuid}::uuid)`
            : sql`u.external_squad_uuid=${selection.squadUuid}::uuid`;
    return sql`true`;
}

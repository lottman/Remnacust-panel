import { Prisma, PrismaClient } from '@prisma/client';

import { decryptSecret } from './xera-crypto';

export async function restoreUserCredentials(tx: Prisma.TransactionClient): Promise<number> {
    let cursor: bigint | undefined;
    let restored = 0;
    for (;;) {
        const users = await tx.users.findMany({
            where: {
                ...(cursor === undefined ? {} : { id: { gt: cursor } }),
                OR: [
                    { trojanPassword: { startsWith: 'xera1:' } },
                    { ssPassword: { startsWith: 'xera1:' } },
                ],
            },
            orderBy: { id: 'asc' },
            take: 250,
            select: { id: true, trojanPassword: true, ssPassword: true },
        });
        if (users.length === 0) return restored;
        // Decrypt the entire batch before writing; a bad APP_SECRET aborts the transaction.
        const updates = users.map((user) => Prisma.sql`(
            ${user.id}::bigint,
            ${user.trojanPassword}::text, ${decryptSecret(user.trojanPassword)}::text,
            ${user.ssPassword}::text, ${decryptSecret(user.ssPassword)}::text
        )`);
        // Compare each original field so a concurrent password edit wins over this repair.
        restored += await tx.$executeRaw(Prisma.sql`
            UPDATE public.users AS u
            SET trojan_password = CASE WHEN u.trojan_password = v.old_trojan
                    THEN v.trojan ELSE u.trojan_password END,
                ss_password = CASE WHEN u.ss_password = v.old_ss
                    THEN v.ss ELSE u.ss_password END
            FROM (VALUES ${Prisma.join(updates)})
                AS v(id, old_trojan, trojan, old_ss, ss)
            WHERE u.id = v.id AND (
                (u.trojan_password = v.old_trojan AND v.old_trojan LIKE 'xera1:%') OR
                (u.ss_password = v.old_ss AND v.old_ss LIKE 'xera1:%')
            )
        `);
        cursor = users[users.length - 1].id;
    }
}

export async function restoreStoredUserCredentials(prisma: PrismaClient): Promise<number> {
    return prisma.$transaction(restoreUserCredentials, { timeout: 300_000 });
}

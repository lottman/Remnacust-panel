import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { restoreUserCredentials } from '../common/utils/restore-user-credentials';

async function main() {
    const action = process.argv[2];
    if (!['--check', '--apply'].includes(action) || process.argv.length !== 3) {
        throw new Error('Usage: node dist/database-compatibility.js --check|--apply');
    }
    const prisma = new PrismaClient();
    try {
        if (action === '--check') {
            const tables = await prisma.$queryRaw`
                SELECT to_regclass('public.admin')::text AS admin,
                       to_regclass('public.xera_admin')::text AS legacy_admin,
                       to_regclass('public.remnawave_settings')::text AS settings,
                       to_regclass('public.xera_remnawave_settings')::text AS legacy_settings,
                       (SELECT count(*)::text FROM public.users
                        WHERE trojan_password LIKE 'xera1:%' OR ss_password LIKE 'xera1:%') AS encrypted_user_count
            `;
            console.log(JSON.stringify(tables));
            return;
        }
        const migration = readFileSync(resolve(
            'prisma/migrations/20261004120000_restore_upstream_table_names/migration.sql',
        ), 'utf8');
        const statement = migration.match(/^DO \$\$[\s\S]*?END \$\$;/m)?.[0];
        if (!statement) throw new Error('Database compatibility migration is missing');
        const restored = await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '10s'");
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(642119804)::text`;
            // The statement comes from the bundled migration, never from request input.
            await tx.$executeRawUnsafe(statement);
            return restoreUserCredentials(tx);
        }, { timeout: 300_000, maxWait: 10_000 });
        console.log(`Compatible table names restored; user credentials restored: ${restored}`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(() => {
    console.error('Compatibility repair failed. Check table conflicts and the original APP_SECRET. No partial repair was committed.');
    process.exitCode = 1;
});

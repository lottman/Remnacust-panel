const assert = require('node:assert/strict');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const k = require('kysely');
const load = require('./load-typescript.cjs');
const { PrismaTxDriver } = require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const { SubscriptionPageConfigRepository } = load(path.join(__dirname, '../src/modules/subscription-page-configs/repositories/subpage-configs.repository.ts'), {
    '@common/database/tx-kysely.service': {}, '@common/helpers/kysely/values': {}, '../subpage-configs.converter': {},
});
async function main() {
    const url = process.env.DATABASE_URL || 'postgresql://postgres@127.0.0.1:55439/postgres';
    const target = new URL(url);
    assert(['localhost', '127.0.0.1'].includes(target.hostname) && target.port === '55439', 'Use the disposable test database');
    const prisma = new PrismaClient({ datasourceUrl: url });
    try {
        await prisma.$transaction(async tx => {
            await tx.$executeRawUnsafe('CREATE TEMPORARY TABLE subscription_page_config(config JSONB) ON COMMIT DROP');
            const db = new k.Kysely({ dialect: {
                createDriver: () => new PrismaTxDriver({ tx }), createAdapter: () => new k.PostgresAdapter(),
                createIntrospector: db => new k.PostgresIntrospector(db), createQueryCompiler: () => new k.PostgresQueryCompiler(),
            } });
            const repository = new SubscriptionPageConfigRepository({}, {}, { kysely: db });
            assert.equal(await repository.connectionKeysMayBeVisible(), true);
            await tx.$executeRawUnsafe('INSERT INTO subscription_page_config VALUES ($1::jsonb)', JSON.stringify({ baseSettings: { showConnectionKeys: false } }));
            assert.equal(await repository.connectionKeysMayBeVisible(), false);
            for (const config of [{ baseSettings: { showConnectionKeys: true } }, {}, { baseSettings: { showConnectionKeys: null } }]) {
                await tx.$executeRawUnsafe('INSERT INTO subscription_page_config VALUES ($1::jsonb)', JSON.stringify(config));
                assert.equal(await repository.connectionKeysMayBeVisible(), true);
                await tx.$executeRawUnsafe("DELETE FROM subscription_page_config WHERE config #> '{baseSettings,showConnectionKeys}' IS DISTINCT FROM 'false'::jsonb");
                assert.equal(await repository.connectionKeysMayBeVisible(), false);
            }
        }, { timeout: 15000 });
        console.log('PASS page visibility SQL: empty/unknown configurations preserve keys; hidden keys skip generation; changes apply immediately');
    } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

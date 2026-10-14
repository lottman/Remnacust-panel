// Actual seed and registration transactions, restricted to a disposable database.
const assert = require('node:assert/strict');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { PrismaClient } = require('@prisma/client');
const k = require('kysely');
const { PrismaTxDriver } = require('../node_modules/@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
const load = require('./load-typescript.cjs');
const defaults = load(path.join(__dirname, '../prisma/seed/default/hwid-settings.ts'));
const { seedSubscriptionSettings } = load(path.join(__dirname, '../prisma/seed/seeders/8_seed-subscription-settings.ts'), {
    '../default': defaults,
    '@libs/contracts/models': require('../libs/contract/build/backend/models'),
    consola: { start() {}, success() {} },
});
const { HwidUserDevicesRepository } = load(path.join(__dirname, '../src/modules/hwid-user-devices/repositories/hwid-user-devices.repository.ts'), {
    '@nestjs-cls/transactional': { Transactional: () => () => {}, TransactionHost: class {} },
    '@common/database': {}, '@common/helpers': {},
    '../hwid-user-devices.converter': {}, '../entities/hwid-user-device.entity': {},
});

async function main() {
    const port = process.env.REMNACUST_TEST_DATABASE_PORT || '55439';
    assert.ok(['55439', '55449'].includes(port), 'Only disposable database ports are accepted');
    const prisma = new PrismaClient({ datasourceUrl: `postgresql://postgres@127.0.0.1:${port}/postgres` });
    const context = new AsyncLocalStorage();
    const tx = { get tx() { return context.getStore() || prisma; } };
    const db = { kysely: new k.Kysely({ dialect: {
        createDriver: () => new PrismaTxDriver(tx),
        createAdapter: () => new k.PostgresAdapter(),
        createIntrospector: db => new k.PostgresIntrospector(db),
        createQueryCompiler: () => new k.PostgresQueryCompiler(),
    } }) };
    const repo = new HwidUserDevicesRepository(tx, db, {
        fromEntityToPrismaModel: value => value, fromPrismaModelToEntity: value => value,
    });
    const transaction = fn => prisma.$transaction(client => context.run(client, fn), { timeout: 15000 });
    const previous = process.env.HWID_ENABLED_DEFAULT;
    const rollback = new Error('intentional fixture rollback');
    let created = false;
    try {
        // Roll back each settings scenario so even other fixtures keep their settings.
        for (const override of [undefined, 'true', 'false']) {
            if (override === undefined) delete process.env.HWID_ENABLED_DEFAULT;
            else process.env.HWID_ENABLED_DEFAULT = override;
            await assert.rejects(prisma.$transaction(async client => {
                await client.subscriptionSettings.deleteMany();
                await seedSubscriptionSettings(client);
                let settings = await client.subscriptionSettings.findFirstOrThrow();
                assert.equal(settings.hwidSettings.enabled, override !== 'false');
                assert.equal(settings.hwidSettings.fallbackDeviceLimit, 999);
                for (const enabled of [false, true]) {
                    const saved = { enabled, fallbackDeviceLimit: 3, maxDevicesAnnounce: 'Saved limit' };
                    await client.subscriptionSettings.update({ where: { uuid: settings.uuid }, data: { hwidSettings: saved } });
                    await seedSubscriptionSettings(client);
                    settings = await client.subscriptionSettings.findFirstOrThrow();
                    assert.deepEqual(settings.hwidSettings, saved, 'startup must retain explicit choices');
                }
                await client.subscriptionSettings.update({ where: { uuid: settings.uuid }, data: { hwidSettings: require('@prisma/client').Prisma.DbNull } });
                await seedSubscriptionSettings(client);
                const initialized = await client.subscriptionSettings.findFirstOrThrow();
                assert.equal(initialized.hwidSettings.enabled, override !== 'false');
                assert.deepEqual(initialized.customRemarks, settings.customRemarks);
                assert.deepEqual(initialized.customResponseHeaders, settings.customResponseHeaders);
                throw rollback;
            }), error => error === rollback);
        }
        await prisma.users.create({ data: {
            id: 994n, username: 'hwid-default-audit', shortUuid: 'hwid-default-audit',
            expireAt: new Date(Date.now() + 86400000),
            trojanPassword: 'fixture-password', vlessUuid: '6eeefad9-fb58-44b1-9c08-bd6b3853f69d', ssPassword: 'fixture-password',
        } });
        created = true;
        const register = (hwid, limit = 3) => transaction(() => repo.createWithAdvisoryLock({ userId: 994n, hwid }, limit));
        const concurrent = await Promise.all(Array.from({ length: 12 }, (_, index) => register(`fixture-device-${index}`)));
        assert.equal(concurrent.filter(result => result.status === 'CREATED').length, 3);
        assert.equal(concurrent.filter(result => result.status === 'LIMIT_REACHED').length, 9);
        const devices = await prisma.hwidUserDevices.findMany({ where: { userId: 994n } });
        assert.equal(devices.length, 3, 'simultaneous registrations must not exceed capacity');
        const existing = devices[0].hwid;
        assert.equal((await register(existing, 1)).status, 'EXISTS', 'lowering the limit must retain known devices');
        await transaction(() => repo.setRegistrationAllowed(994n, false));
        assert.equal((await register(existing)).status, 'EXISTS');
        assert.equal((await register('fixture-unlimited-denied', Number.MAX_SAFE_INTEGER)).status, 'REGISTRATION_BLOCKED');
        await transaction(() => repo.setRegistrationAllowed(994n, true));
        assert.equal((await register('fixture-unlimited-allowed', Number.MAX_SAFE_INTEGER)).status, 'CREATED');
        assert.equal((await register('fixture-full-denied')).status, 'LIMIT_REACHED');
        await prisma.hwidUserDevices.deleteMany({ where: { userId: 994n } });
        const duplicates = await Promise.all(Array.from({ length: 8 }, () => register('fixture-same-device', 1)));
        assert.equal(duplicates.filter(result => result.status === 'CREATED').length, 1);
        assert.equal(duplicates.filter(result => result.status === 'EXISTS').length, 7);
        console.log('PASS PostgreSQL HWID: enabled defaults, explicit override, saved settings, legacy initialization, concurrent capacity, duplicate registration and registration policy');
    } finally {
        if (created) await prisma.users.deleteMany({ where: { id: 994n } });
        await prisma.$disconnect();
        if (previous === undefined) delete process.env.HWID_ENABLED_DEFAULT;
        else process.env.HWID_ENABLED_DEFAULT = previous;
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

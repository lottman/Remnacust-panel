const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const load = require('./load-typescript.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const database = new PrismaClient({ datasourceUrl: process.env.TEST_GEOFILES_DATABASE_URL });
const { GeofilesService } = load(path.resolve(__dirname, '../src/modules/subscription-template/geofiles/geofiles.service.ts'), { ...mocks, '../generators/client-pool': pool });
const service = new GeofilesService({ getOrThrow: () => 'sub.example.test' }, {}, database);
process.once('message', async () => {
    try {
        const item = await service.ingest('worker-' + process.pid, 'singbox-json', async () => Buffer.from('{"version":3,"rules":[{"domain_suffix":["example.test"]}]}'));
        process.send({ id: item.id });
    } catch (error) {
        process.send({ error: error.message }); process.exitCode = 1;
    } finally {
        await database.$disconnect(); process.disconnect();
    }
});
process.send({ ready: true });

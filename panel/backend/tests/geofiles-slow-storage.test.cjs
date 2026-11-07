const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const f = require('./geofiles-fixture.cjs');
const { GeofilesService } = load(path.join(__dirname, '../src/modules/subscription-template/geofiles/geofiles.service.ts'), {
    ...mocks, '../generators/client-pool': pool,
    '@common/config/app-config/typed-config.service': {}, '@common/database/prisma.service': {},
});

test('slow cold storage is read once for a burst and a new file revision cannot reuse warm rules', async () => {
    const service = new GeofilesService({ getOrThrow: () => 'fixture.test' }, {}, {});
    const file = { id: '00' + 'a'.repeat(32), sha256: 'a'.repeat(64), kind: 'geosite' };
    let reads = 0;
    let data = f.geosite;
    let fail = false;
    service.readActive = async () => {
        reads++;
        await new Promise(resolve => setTimeout(resolve, 40));
        if (fail) throw Error('temporary storage outage');
        return data;
    };
    const cold = await Promise.all(Array.from({ length: 128 }, () => service.compile(file, ['example'])));
    assert.equal(reads, 1);
    assert(cold.every(result => result === cold[0]));
    await Promise.all(Array.from({ length: 128 }, () => service.compile(file, ['example'])));
    assert.equal(reads, 1, 'Warm requests must not reread the DAT');
    const changed = { ...file, sha256: 'b'.repeat(64) };
    fail = true;
    const failed = await Promise.allSettled(Array.from({ length: 128 }, () => service.compile(changed, ['example'])));
    assert(failed.every(result => result.status === 'rejected'));
    assert.equal(reads, 2);
    assert.equal(service.compilingByKey.size, 0);
    fail = false;
    data = f.bytes(1, Buffer.concat([f.bytes(1, 'EXAMPLE'), f.bytes(2, f.domain(2, 'changed.example'))]));
    const updated = await Promise.all(Array.from({ length: 128 }, () => service.compile(changed, ['example'])));
    assert.equal(reads, 3);
    assert(updated.every(result => result === updated[0]));
    assert.deepEqual(updated[0].domains, [{ type: 2, value: 'changed.example' }]);
    assert(!updated[0].domains.some(record => record.value === 'example.com'));
    assert.equal(service.compiling, 0);
});

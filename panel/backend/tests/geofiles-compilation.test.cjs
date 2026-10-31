const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { mocks: poolMocks, pool } = require('./client-pool-fixture.cjs');
const { geosite } = require('./geofiles-fixture.cjs');
const { GeofilesService } = load(path.join(__dirname, '../src/modules/subscription-template/geofiles/geofiles.service.ts'), {
    ...poolMocks, '../generators/client-pool': pool,
    '@common/config/app-config/typed-config.service': {}, '@common/database/prisma.service': {},
});
const file = { id: 'a'.repeat(34), sha256: 'a'.repeat(64), kind: 'geosite' };
function service() { return new GeofilesService({ getOrThrow: () => 'fixture.test' }, {}, {}); }

test('simultaneous subscriptions share one compilation instead of failing the third identical request', async () => {
    const s = service(); let reads = 0, release;
    s.readActive = async () => { reads++; await new Promise(r => release = r); return geosite; };
    const jobs = Array.from({ length: 10 }, () => s.compile(file, ['example']));
    assert.equal(reads, 1); release(); const results = await Promise.all(jobs);
    assert(results.every(r => r === results[0])); assert.equal(s.compiling, 0); assert.equal(s.compilingByKey.size, 0);
    await s.compile(file, ['example']); assert.equal(reads, 1);
});
test('different compilations remain bounded and failed work can be retried', async () => {
    const s = service(); const releases = [];
    s.readActive = () => new Promise(r => releases.push(() => r(geosite)));
    const first = s.compile(file, ['example']);
    const second = s.compile({ ...file, sha256: 'b'.repeat(64) }, ['example']);
    await assert.rejects(s.compile({ ...file, sha256: 'c'.repeat(64) }, ['example']), /geofile-busy/);
    releases.forEach(r => r()); await Promise.all([first, second]);
    const changed = { ...file, sha256: 'd'.repeat(64) }; let reads = 0;
    s.readActive = async () => { if (++reads === 1) throw Error('temporary read failure'); return geosite; };
    await assert.rejects(s.compile(changed, ['example']), /temporary read failure/);
    assert.equal(s.compilingByKey.size, 0); assert.equal(s.compiling, 0);
    assert((await s.compile(changed, ['example'])).domains.length > 0); assert.equal(reads, 2);
});

test('selection validation and inline rules use separate cache entries', async () => {
    const s = service(); let reads = 0;
    s.readActive = async () => { reads++; return geosite; };
    assert.deepEqual(await s.compile(file, ['example'], true), {ips: [], domains: []});
    assert.equal((await s.compile(file, ['example'])).domains.length, 2);
    await s.compile(file, ['example'], true); await s.compile(file, ['example']);
    assert.equal(reads, 2);
});

test('concurrent bundle and checksum requests share cold work and preserve every namespaced category', async () => {
    const s=service();let reads=0, release;
    s.fileById=async id=>({...file,id,size:geosite.length});s.activeFile=f=>f;
    s.readActive=async()=>{reads++;await new Promise(r=>release=r);return geosite;};
    const jobs=Array.from({length:12},()=>s.bundleContent('geosite',[file.id]));
    while(!release) await new Promise(r=>setImmediate(r));
    assert.equal(reads,1);release();
    const results=await Promise.all(jobs);
    assert(results.every(r=>r===results[0]));assert.equal(s.bundling,0);assert.equal(s.bundlingByKey.size,0);
    const {datCategory}=load(path.join(__dirname,'../src/modules/subscription-template/geofiles/xray-geofile-delivery.ts'), {'../generators/client-pool':pool});
    const {compileDat}=load(path.join(__dirname,'../src/modules/subscription-template/geofiles/compile-dat.ts'),poolMocks);
    assert.equal(compileDat(results[0],'geosite',[datCategory(file.id,'example')]).domains.length,2);
    assert.equal(reads,1);await s.bundleContent('geosite',[file.id]);assert.equal(reads,1);
});

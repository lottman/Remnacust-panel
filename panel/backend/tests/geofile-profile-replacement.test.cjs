const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { pool } = require('./client-pool-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');
const { XrayGeofileDelivery } = load(path.join(root, 'xray-geofile-delivery.ts'), {
    '../generators/client-pool': pool,
});
const { stabilizeRoutingProfile } = load(path.join(root, 'stabilize-routing-profile.ts'));
const decode = header => JSON.parse(Buffer.from(header.split('/onadd/')[1], 'base64'));
const first = '00' + 'a'.repeat(32);
const second = '01' + 'b'.repeat(32);
const clock = 1_793_200_000_000;
const ruleFields = ['DirectIp', 'BlockIp', 'ProxyIp', 'DirectSites', 'BlockSites', 'ProxySites'];

function revisions() {
    const entries = new Map();
    return async (key, fingerprint, minimum) => {
        const previous = entries.get(key);
        if (previous?.fingerprint === fingerprint) return previous.revision;
        const revision = Math.max(minimum, (previous?.revision ?? 0) + 1);
        entries.set(key, { fingerprint, revision });
        return revision;
    };
}

async function render(client, references, resolve, legacy = false) {
    const delivery = new XrayGeofileDelivery(client, 'remote', 'Subscription');
    const downloads = [];
    const rules = references.map(({ kind, id, target }) => {
        const values = delivery.register(kind, { id, target, categories: ['example'] }, async (kind, ids) => {
            downloads.push({ kind, ids });
            return `https://subscription.example.test/${kind}/${ids.join('-')}.dat`;
        });
        return { type: 'field', [kind === 'geoip' ? 'ip' : 'domain']: values, outboundTag: target };
    });
    let header = await delivery.header(JSON.stringify([{ routing: { rules } }]), 'provider/user', clock);
    if (legacy) {
        const profile = decode(header);
        for (const [kind, suffix] of [['geoip', 'Ip'], ['geosite', 'Sites']]) {
            if (references.some(reference => reference.kind === kind)) continue;
            for (const action of ['Direct', 'Block', 'Proxy']) delete profile[action + suffix];
        }
        header = `${client}://routing/onadd/${Buffer.from(JSON.stringify(profile)).toString('base64')}`;
    }
    return { profile: decode(await stabilizeRoutingProfile(header, delivery.intervalHours, resolve, 'device')), downloads };
}

test('replacing GeoIP and GeoSite with one file explicitly clears the removed URLs and rule lists', async () => {
    for (const client of ['happ', 'incy']) {
        for (const remaining of ['geoip', 'geosite']) {
            const resolve = revisions();
            const files = [{ kind: 'geoip', id: first, target: 'DIRECT' }, { kind: 'geosite', id: second, target: 'REJECT' }];
            const before = await render(client, files, resolve);
            const after = await render(client, files.filter(file => file.kind === remaining), resolve);
            assert.equal(after.profile.Name, before.profile.Name);
            assert(Number(after.profile.LastUpdated) > Number(before.profile.LastUpdated));
            assert.deepEqual(after.downloads, [{ kind: remaining, ids: [remaining === 'geoip' ? first : second] }]);
            const removed = remaining === 'geoip' ? 'Sites' : 'Ip';
            assert.equal(after.profile[remaining === 'geoip' ? 'Geositeurl' : 'Geoipurl'], '');
            for (const action of ['Direct', 'Block', 'Proxy']) assert.deepEqual(after.profile[action + removed], [], `${client}: removed ${action + removed}`);
            for (const field of ruleFields) assert(Array.isArray(after.profile[field]), `${client}: missing ${field}`);
            const replaced = { ...before.profile, ...after.profile };
            for (const action of ['Direct', 'Block', 'Proxy']) assert.deepEqual(replaced[action + removed], []);
            const repeated = await render(client, files.filter(file => file.kind === remaining), resolve);
            assert.deepEqual(repeated.profile, after.profile);
        }
    }
});

test('removing one of two files of the same kind rebuilds the bundle without the removed source', async () => {
    for (const client of ['happ', 'incy']) {
        for (const kind of ['geoip', 'geosite']) {
            const resolve = revisions();
            const files = [{ kind, id: first, target: 'DIRECT' }, { kind, id: second, target: 'REJECT' }];
            const before = await render(client, files, resolve);
            const after = await render(client, files.slice(0, 1), resolve);
            const urlField = kind === 'geoip' ? 'Geoipurl' : 'Geositeurl';
            assert.equal(after.profile.Name, before.profile.Name);
            assert(Number(after.profile.LastUpdated) > Number(before.profile.LastUpdated));
            assert.deepEqual(after.downloads, [{ kind, ids: [first] }]);
            assert(!after.profile[urlField].includes(second));
            assert.notEqual(before.profile[urlField], after.profile[urlField]);
            assert.deepEqual(after.profile[kind === 'geoip' ? 'BlockIp' : 'BlockSites'], []);
        }
    }
});

test('upgrading with an already cached legacy profile advances its revision once and replaces stale file rules', async () => {
    for (const client of ['happ', 'incy']) {
        for (const remaining of ['geoip', 'geosite']) {
            const resolve = revisions();
            const files = [{ kind: 'geoip', id: first, target: 'DIRECT' }, { kind: 'geosite', id: second, target: 'REJECT' }];
            const previous = await render(client, files, resolve, true);
            const selected = files.filter(file => file.kind === remaining);
            const legacy = await render(client, selected, resolve, true);
            const storedClientProfile = { ...previous.profile, ...legacy.profile };
            const removedField = remaining === 'geoip' ? 'BlockSites' : 'DirectIp';
            assert(storedClientProfile[removedField].length > 0, 'Legacy partial updates retain stale rules');
            const upgraded = await render(client, selected, resolve);
            assert.equal(upgraded.profile.Name, legacy.profile.Name);
            assert(Number(upgraded.profile.LastUpdated) > Number(legacy.profile.LastUpdated));
            const replaced = { ...storedClientProfile, ...upgraded.profile };
            assert.deepEqual(replaced[removedField], []);
            assert.equal([replaced.Geoipurl, replaced.Geositeurl].filter(Boolean).length, 1);
            const nextRequest = await render(client, selected, resolve);
            assert.deepEqual(nextRequest.profile, upgraded.profile, 'Unchanged subscription does not trigger another profile update');
        }
    }
});

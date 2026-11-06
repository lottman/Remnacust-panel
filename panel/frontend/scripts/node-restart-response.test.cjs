const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { createRequire } = require('node:module');
const load = require('../../backend/tests/load-typescript.cjs');
const root = path.join(__dirname, '..');
const axios = createRequire(path.join(root, 'package.json'))('axios');

function client() {
    return load(path.join(root, 'src/shared/api/axios.ts'), {
        axios,
        '@remnawave/backend-contract': {
            REMNAWAVE_CLIENT_TYPE_BROWSER: 'browser',
            REMNAWAVE_CLIENT_TYPE_HEADER: 'x-client-type',
        },
        'consola/browser': {},
        i18next: { t: key => key },
        '../emitters/emit-logout': { logoutEvents: { emit() { throw new Error('unexpected logout'); } } },
        '../utils/panel-maintenance': { setPanelMaintenance() {} },
    }, {
        __DOMAIN_BACKEND__: 'https://panel.example.test',
        __NODE_ENV__: 'production',
        __DOMAIN_OVERRIDE__: '0',
        window: { location: { origin: 'https://panel.example.test' } },
    }).instance;
}

for (const forceRestart of [false, true]) {
    test(`empty 202 accepts ${forceRestart ? 'hard' : 'soft'} restart without replay`, async () => {
        const instance = client();
        let calls = 0;
        instance.defaults.adapter = async config => {
            calls++;
            assert.equal(config.method, 'post');
            assert.deepEqual(JSON.parse(config.data), { forceRestart });
            return { config, status: 202, statusText: 'Accepted', headers: {}, data: '' };
        };
        const response = await instance.post('/api/nodes/test/actions/restart', { forceRestart });
        assert.equal(response.status, 202);
        assert.equal(response.data, undefined);
        assert.equal(calls, 1);
    });
}

test('nonempty 202 responses still undergo JSON validation without replaying mutations', async () => {
    for (const data of ['<html>unavailable</html>', '{"response":', 'null', '42']) {
        const instance = client();
        let calls = 0;
        instance.defaults.adapter = async config => {
            calls++;
            return { config, status: 202, statusText: 'Accepted', headers: {}, data };
        };
        await assert.rejects(instance.post('/api/nodes/test/actions/restart', {}), {
            code: 'INVALID_API_RESPONSE',
        });
        assert.equal(calls, 1);
    }
});

test('ordinary empty 200 response remains invalid', async () => {
    const instance = client();
    instance.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: '' });
    await assert.rejects(instance.post('/api/test', {}), { code: 'INVALID_API_RESPONSE' });
});

test('202 payload and 204 behavior remain supported', async () => {
    for (const [status, data, expected] of [
        [202, undefined, undefined],
        [202, '{"response":{"accepted":true}}', { response: { accepted: true } }],
        [204, '', ''],
    ]) {
        const instance = client();
        instance.defaults.adapter = async config => ({ config, status, headers: {}, data });
        assert.deepEqual((await instance.post('/api/test', {})).data, expected);
    }
});

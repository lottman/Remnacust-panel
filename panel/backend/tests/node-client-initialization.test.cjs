const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const ref = { exports: {} };
class AxiosError extends Error {}
const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/common/axios/axios.service.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true, esModuleInterop: true },
}).outputText;
new Function('require', 'module', 'exports', output)((id) => {
    if (id === 'axios') return { __esModule: true, AxiosError, default: { create: () => ({ defaults: { headers: { common: {} } } }) } };
    if (id === '@nestjs/common') return { Injectable: () => (value) => value, Logger: class { error() {} log() {} } };
    if (id === '@contract/constants') return { ERRORS: { INTERNAL_SERVER_ERROR: {}, NODE_ERROR_WITH_MSG: {withMessage: message => ({message})} } };
    if (id === '@remnawave/node-contract') return { RemoveUserCommand: { url: '/node/handler/remove-user' } };
    if (id.endsWith('/get-node-jwt')) return { GetNodeJwtCommand: class {} };
    if (id === '@common/utils/certs') return { deriveSni: () => 'audit.invalid' };
    if (id === '../types') return { ok: (response) => ({ isOk: true, response }), fail: (error) => ({ isOk: false, error }) };
    if (id.startsWith('node:')) {
        if (id === 'node:zlib') return { constants: {}, zstdCompress: (_data, _options, done) => done(null, Buffer.alloc(0)) };
        return require(id);
    }
    return {};
}, ref, ref.exports);
const { AxiosService } = ref.exports;
const jwt = { isOk: true, response: { jwtToken: 'test-token', caCert: '', clientCert: '', clientKey: '', jwtPublicKey: '' } };
const opts = { address: 'audit.invalid', port: 2222, proxyUrl: null };
const config = { getOrThrow: () => true };
test('node requests support raw and bracketed IPv6 addresses', async () => {
    const service = new AxiosService({ execute: async () => jwt }, {}, config);
    const urls = [];
    service.axiosInstance.get = async (url) => {
        urls.push(new URL(url).href);
        return { data: { response: {} } };
    };
    for (const address of ['2001:db8::1', '[2001:db8::1]']) {
        assert.equal((await service.managedCore({ ...opts, address })).isOk, true);
    }
    assert.deepEqual(urls, Array(2).fill('https://[2001:db8::1]:2222/node/xray/managed-core'));
});
test('concurrent API node requests initialize mTLS and JWT exactly once', async () => {
    let initializations = 0;
    const service = new AxiosService({ execute: async () => { initializations++; await new Promise(r => setTimeout(r, 10)); return jwt; } }, {}, config);
    service.axiosInstance.post = async (_url, _data, config) => {
        assert.equal(service.axiosInstance.defaults.headers.common.Authorization, 'Bearer test-token');
        assert.ok(config.httpsAgent);
        return { data: { response: { success: true } } };
    };
    const results = await Promise.all([service.deleteUser({}, opts), service.deleteUser({}, opts)]);
    assert.ok(results.every(result => result.isOk));
    assert.equal(initializations, 1);
});
test('failed credential initialization fails closed and can retry', async () => {
    let attempts = 0;
    const service = new AxiosService({ execute: async () => ++attempts === 1 ? { isOk: false } : jwt }, {}, config);
    service.axiosInstance.post = async () => ({ data: { response: { success: true } } });
    assert.equal((await service.deleteUser({}, opts)).isOk, false);
    assert.equal((await service.deleteUser({}, opts)).isOk, true);
    assert.equal(attempts, 2);
});

test('core status and actions use the node API prefix with initialized mTLS', async () => {
    const service = new AxiosService({ execute: async () => jwt }, {}, config);
    const requests = [];
    service.axiosInstance.get = async (url, config) => {
        requests.push(url);
        assert.ok(config.httpsAgent);
        assert.equal(config.maxRedirects, 0);
        return { data: { response: { capabilityVersion: 1 } } };
    };
    service.axiosInstance.post = async (url, data, config) => {
        requests.push(url);
        assert.deepEqual(data, { action: 'check' });
        assert.ok(config.httpsAgent);
        assert.equal(config.maxRedirects, 0);
        return { data: { response: { accepted: true } } };
    };
    assert.equal((await service.managedCore(opts)).response.capabilityVersion, 1);
    assert.equal((await service.managedCore(opts, { action: 'check' })).isOk, true);
    assert.deepEqual(requests, [
        'https://audit.invalid:2222/node/xray/managed-core',
        'https://audit.invalid:2222/node/xray/managed-core/actions',
    ]);
});

test('SNI compatibility switch preserves certificate and client authentication', async () => {
    for (const enabled of [true, false]) {
        const service = new AxiosService({ execute: async () => jwt }, {}, { getOrThrow: key => {
            assert.equal(key, 'SERVICE_SNI_VERIFICATION');
            return enabled;
        } });
        await service.setJwt();
        const options = service.axiosInstance.defaults.httpsAgent.options;
        assert.equal(options.servername, enabled ? 'audit.invalid' : undefined);
        assert.equal(options.rejectUnauthorized, true);
        assert.equal(options.minVersion, 'TLSv1.3');
        assert.equal(options.cert, jwt.response.clientCert);
        assert.equal(options.key, jwt.response.clientKey);
        assert.equal(options.ca, jwt.response.caCert);
    }
});

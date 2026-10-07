const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');
function fixture(post) {
    const events = [];
    const { useLogout } = load(path.join(__dirname, '../../frontend/src/shared/hooks/use-logout.ts'), {
        '@mantine/notifications': { notifications: { show: () => events.push('error') } },
        axios: { isAxiosError: e => e.isAxiosError === true },
        react: { useRef: value => ({ current: value }), useState: value => [value, () => {}] },
        'react-i18next': { useTranslation: () => ({ i18n: { language: 'ru' } }) },
        'react-router': { useNavigate: () => () => events.push('navigate') },
        '@entities/auth': { removeToken: () => events.push('removeToken') },
        '@shared/api': { clearQueryClient: () => events.push('clearCache') },
        '@shared/api/axios': { instance: { post } },
        '@shared/constants': { ROUTES: { AUTH: { LOGIN: '/login' } } },
        '@shared/emitters': { logoutEvents: { emit: () => events.push('lockVaultAndModals') } },
        '@shared/hocs/store-wrapper': { resetAllStores: () => events.push('reset') },
        '@shared/i18n/interface-text': { useUiText: () => key => key },
        './use-auth': { useAuth: () => ({ setIsAuthenticated: () => events.push('unauthenticated') }) },
    });
    return { events, ...useLogout() };
}

test('logout waits for server revocation and prevents duplicate requests', async () => {
    let release, calls = 0;
    const f = fixture(async (url, body, options) => {
        calls++;
        assert.equal(url, '/api/auth/logout');
        assert.equal(options.timeout, 15000);
        await new Promise(resolve => { release = resolve; });
    });
    const first = f.logout();
    await f.logout();
    assert.equal(calls, 1);
    assert.deepEqual(f.events, []);
    release();
    await first;
    assert.deepEqual(f.events, ['lockVaultAndModals', 'unauthenticated', 'removeToken', 'reset', 'clearCache', 'navigate']);
});

test('network or server failure does not falsely claim logout; retry remains possible', async () => {
    let fail = true;
    const f = fixture(async () => { if (fail) throw new Error('offline'); });
    await f.logout();
    assert.deepEqual(f.events, ['error']);
    fail = false;
    await f.logout();
    assert.ok(f.events.includes('removeToken'));
});

test('already expired or revoked sessions can be cleared locally', async () => {
    for (const status of [401]) {
        const f = fixture(async () => { throw { isAxiosError: true, response: { status } }; });
        await f.logout();
        assert.ok(f.events.includes('removeToken'));
        assert.equal(f.events.includes('error'), false);
    }
});

test('forbidden logout does not hide a still-active server session', async () => {
    const f = fixture(async () => { throw { isAxiosError: true, response: { status: 403 } }; });
    await f.logout();
    assert.deepEqual(f.events, ['error']);
});

test('a late unauthorized response cannot clear a newer browser session', async () => {
    let rejectResponse;
    let logouts = 0;
    const instance = { interceptors: {
        request: { use() {} },
        response: { use: (_success, failure) => { rejectResponse = failure; } },
    } };
    const api = load(path.join(__dirname, '../../frontend/src/shared/api/axios.ts'), {
        '@remnawave/backend-contract': { REMNAWAVE_CLIENT_TYPE_HEADER: 'x-client-type', REMNAWAVE_CLIENT_TYPE_BROWSER: 'browser' },
        axios: { create: () => instance, isAxiosError: () => false },
        'consola/browser': { log() {} },
        '../emitters/emit-logout': { logoutEvents: { emit: () => logouts++ } },
        './api-response': { parseApiResponse: data => data },
    }, { __DOMAIN_BACKEND__: 'https://panel.test', __NODE_ENV__: 'production',
        __DOMAIN_OVERRIDE__: '0', window: { location: { origin: 'https://panel.test' } } });
    api.setAuthorizationToken('new-session');
    const reject = (token, status = 401) => rejectResponse({ response: { status },
        config: { headers: { get: () => `Bearer ${token}` } } });
    await assert.rejects(reject('old-session'));
    assert.equal(logouts, 0);
    await assert.rejects(reject('new-session', 403));
    assert.equal(logouts, 0);
    await assert.rejects(reject('new-session'));
    assert.equal(logouts, 1);
});

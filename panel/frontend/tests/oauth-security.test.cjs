const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function load(relative, mocks = {}, globals = {}) {
    const filename = path.join(__dirname, '..', relative);
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', ...Object.keys(globals), output)(
        (id) => {
            if (!(id in mocks)) throw new Error(`Unexpected import: ${id}`);
            return mocks[id];
        }, module, module.exports, ...Object.values(globals),
    );
    return module.exports;
}

function fixture() {
    const values = new Map();
    const storage = {
        getItem: (k) => values.get(k) ?? null,
        setItem: (k, v) => values.set(k, v),
        removeItem: (k) => values.delete(k),
    };
    const state = load('src/shared/utils/oauth2-state.util.ts', {}, { sessionStorage: storage });
    return { values, storage, state };
}

test('state is tab-local, provider-bound, expires, and can be consumed only once', () => {
    const f = fixture();
    assert.equal(f.state.consumeOAuth2State('github', 'state-a'), false);
    assert.equal(f.state.saveOAuth2State('github', 'https://id.example.test/auth?state=state-a'), true);
    assert.equal(fixture().state.consumeOAuth2State('github', 'state-a'), false);
    assert.equal(f.state.consumeOAuth2State('generic', 'state-a'), false);
    assert.equal(f.state.consumeOAuth2State('github', 'state-a'), true);
    assert.equal(f.state.consumeOAuth2State('github', 'state-a'), false);
    f.state.saveOAuth2State('github', 'https://id.example.test/auth?state=state-a');
    assert.equal(f.state.consumeOAuth2State('github', 'wrong'), false);
    assert.equal(f.state.consumeOAuth2State('github', 'state-a'), false);
    for (const saved of ['{', 'null', JSON.stringify({ state: 'state-a', expiresAt: Date.now() - 1 })]) {
        f.values.set('oauth2:state:github', saved);
        assert.equal(f.state.consumeOAuth2State('github', 'state-a'), false);
    }
});

test('invalid authorization URLs, providers, and unavailable storage fail closed', () => {
    const f = fixture();
    for (const url of ['invalid', 'https://id.example.test/auth', 'https://id.example.test/auth?state=']) {
        assert.equal(f.state.saveOAuth2State('github', url), false);
    }
    assert.equal(f.state.saveOAuth2State('unknown', 'https://id.example.test/auth?state=a'), false);
    f.storage.setItem = () => { throw new Error('blocked'); };
    assert.equal(f.state.saveOAuth2State('github', 'https://id.example.test/auth?state=a'), false);
    f.storage.getItem = () => { throw new Error('blocked'); };
    assert.equal(f.state.consumeOAuth2State('github', 'a'), false);
});

const jsx = { jsx: () => null, jsxs: () => null };

test('login button saves the request provider state before redirect and blocks redirect on storage failure', () => {
    const f = fixture();
    let options;
    let redirects = 0;
    const messages = [];
    const { OAuth2LoginButtonsFeature } = load('src/features/auth/oauth2-login-button/oauth2-login-button.feature.tsx', {
        'react/jsx-runtime': jsx,
        react: { useState: () => [null, () => {}] },
        '@mantine/core': {},
        '@mantine/notifications': { notifications: { show: (m) => messages.push(m) } },
        'react-icons/bi': {}, 'react-icons/si': {}, 'react-icons/tb': {},
        '@shared/api/hooks': { useOAuth2Authorize: (o) => { options = o; return { mutate() {} }; } },
        '@shared/i18n/interface-text': { useUiText: () => (key) => key },
        '@shared/utils/oauth2-state.util': f.state,
    }, {
        window: { location: { assign: () => {
            assert.equal(f.state.consumeOAuth2State('github', 'state-a'), true);
            redirects++;
        } } },
        setTimeout: () => {},
    });
    OAuth2LoginButtonsFeature({ authentication: { oauth2: { providers: {} } } });
    const complete = () => options.mutationFns.onSuccess(
        { authorizationUrl: 'https://id.example.test/auth?state=state-a' }, { variables: { provider: 'github' } },
    );
    complete();
    assert.equal(redirects, 1);
    f.storage.setItem = () => { throw new Error('blocked'); };
    complete();
    assert.equal(redirects, 1);
    assert.equal(messages.length, 1);
});

function callback(f, query = 'code=fixture-code&state=state-a', provider = 'github') {
    const effects = [];
    const exchanges = [];
    const navigations = [];
    const messages = [];
    const { Oauth2CallbackPage } = load('src/pages/auth/oauth2-callback/oauth2-callback.page.tsx', {
        'react/jsx-runtime': jsx,
        react: { useEffect: (fn) => effects.push(fn), useRef: (value) => ({ current: value }) },
        'react-router': {
            useParams: () => ({ provider }), useSearchParams: () => [new URLSearchParams(query)],
            useNavigate: () => (...args) => navigations.push(args),
        },
        '@mantine/core': {}, '@tabler/icons-react': {},
        '@mantine/notifications': { notifications: { show: (m) => messages.push(m) } },
        '@shared/api/hooks': { useOauth2Callback: () => ({ mutate: (v) => exchanges.push(v), isPending: false }) },
        '@shared/constants': { ROUTES: { AUTH: { LOGIN: '/login' }, DASHBOARD: { HOME: '/dashboard' } } },
        '@shared/hooks/use-auth': { useAuth: () => ({ setIsAuthenticated() {} }) },
        '@shared/i18n/interface-text': { useUiText: () => (key) => key },
        '@shared/ui/page': {}, '@shared/utils/return-to.util': { consumeReturnTo: () => null },
        '@shared/utils/oauth2-state.util': f.state,
    });
    Oauth2CallbackPage();
    // Model React's effect setup replay with the same mounted component refs.
    effects[0]();
    effects[0]();
    return { exchanges, navigations, messages };
}

test('callback refuses unsolicited/mismatched/malformed callbacks before any API exchange', () => {
    for (const [query, provider] of [
        ['code=fixture-code&state=state-a', 'github'],
        ['code=fixture-code&state=wrong', 'github'],
        ['code=fixture-code&state=state-a', 'generic'],
        ['state=state-a', 'github'],
        ['code=fixture-code', 'github'],
        ['code=fixture-code&state=state-a', 'unknown'],
    ]) {
        const f = fixture();
        if (query !== 'code=fixture-code&state=state-a' || provider !== 'github') {
            f.state.saveOAuth2State('github', 'https://id.example.test/auth?state=state-a');
        }
        const r = callback(f, query, provider);
        assert.equal(r.exchanges.length, 0);
        assert.deepEqual(r.navigations, [['/login', { replace: true }]]);
        assert.equal(r.messages.length, 1);
    }
});

test('valid callback exchanges once despite effect replay; remount cannot reuse consumed state', () => {
    const f = fixture();
    f.state.saveOAuth2State('github', 'https://id.example.test/auth?state=state-a');
    const r = callback(f);
    assert.deepEqual(r.exchanges, [{ variables: { provider: 'github', code: 'fixture-code', state: 'state-a' } }]);
    assert.equal(r.navigations.length, 0);
    assert.equal(callback(f).exchanges.length, 0);
});

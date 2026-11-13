const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function fixture(language = 'en') {
    const strings = JSON.parse(fs.readFileSync(path.join(__dirname, `../public/locales/${language}/remnawave.json`), 'utf8'));
    const calls = [], states = [];
    let cursor = 0, mutation;
    const query = { data: [], isPending: false, isSuccess: true, isError: false };
    const updates = { isPending: false, isError: false, mutate() {} };
    const presets = [
        { id: 'geoip', provider: 'Loyalsoldier', kind: 'geoip', name: 'GeoIP', url: 'https://example.test/geoip.dat' },
        { id: 'geosite', provider: 'Loyalsoldier', kind: 'geosite', name: 'GeoSite', url: 'https://example.test/geosite.dat' },
        { id: 'other', provider: 'Other', kind: 'geosite', name: 'Other', url: 'https://other.test/dat' },
    ];
    const api = {
        async get(url, options) { calls.push(['GET', url]); return { data: { response: query.data } }; },
        async post(...args) { calls.push(['POST', ...args]); return { data: { response: { updated: true } } }; },
    };
    const accordion = Object.assign('Accordion', { Item: 'Item', Control: 'Control', Panel: 'Panel' });
    const mocks = {
        '@mantine/core': { Accordion: accordion, ...Object.fromEntries(['Alert', 'Badge', 'Button', 'Group', 'Loader', 'Stack', 'Text'].map(name => [name, name])) },
        '@tanstack/react-query': {
            useQuery: options => { calls.push(['QUERY', options]); return query; },
            useMutation: options => { mutation = options; return updates; },
            useQueryClient: () => ({ invalidateQueries: async options => calls.push(['INVALIDATE', options]) }),
        },
        react: { useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value; }]; } },
        'react-i18next': { useTranslation: () => ({ t: key => { const text = key.split('.').reduce((value, part) => value?.[part], strings); assert.equal(typeof text, 'string', `${language}: ${key}`); return text; } }) },
        '@shared/api': { instance: api },
        '../../../templates/subscription-template-editor/geofile-presets': { geofilePresets: presets },
        '../../../templates/subscription-template-editor/geofile-refresh-settings': { GeofileRefreshSettings: 'RefreshSettings' },
    };
    const source = fs.readFileSync(path.join(__dirname, '../src/widgets/dashboard/subscription-settings/settings/cards/default-geofiles-panel.widget.tsx'), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
    const ref = { exports: {} };
    new Function('require', 'module', 'exports', compiled)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), ref, ref.exports);
    function elements(value) {
        if (Array.isArray(value)) return value.flatMap(elements);
        if (!value || typeof value !== 'object') return [];
        if (typeof value.type === 'function') return elements(value.type(value.props));
        return [value, ...elements(value.props?.children)];
    }
    const render = () => { cursor = 0; return elements(ref.exports.DefaultGeofilesPanel()); };
    const open = () => { render()[0].props.onChange('defaults'); return render(); };
    return { calls, api, presets, query, updates, render, open, mutation: () => mutation };
}

for (const language of ['ru', 'en', 'fa', 'zh']) test(`${language}: default sources are lazy and explicit updates import only missing sources`, async () => {
    const app = fixture(language);
    app.render();
    assert.deepEqual(app.calls, []);
    app.open();
    assert.equal(app.calls.length, 1);
    assert.deepEqual(app.calls[0][1].queryKey, ['template-geofiles']);
    assert.equal(app.calls.some(call => call[0] === 'POST'), false);
    await app.mutation().mutationFn();
    const writes = app.calls.filter(call => call[0] === 'POST');
    assert.equal(writes.length, 2);
    assert.deepEqual(writes.map(call => call[2]), app.presets.slice(0, 2).map(source => ({ name: source.name, kind: source.kind, url: source.url })));
    assert(writes.every(call => call[3].timeout === 45000));
});

test('existing sources reuse the ordinary library and expose per-file schedules', async () => {
    const app = fixture();
    app.query.data = [{ id: 'owned', kind: 'geoip', refresh: { sourceUrl: app.presets[0].url, enabled: false, intervalSeconds: 86400 } }];
    const controls = app.open();
    assert.equal(controls.filter(item => item.type === 'RefreshSettings').length, 1);
    app.api.post = async (...args) => { app.calls.push(['POST', ...args]); return { data: { response: { updated: false } } }; };
    await app.mutation().mutationFn();
    assert.deepEqual(app.calls.filter(call => call[0] === 'POST').map(call => call[1]), ['/api/geofiles/owned/refresh', '/api/geofiles/import']);
    assert(app.render().some(item => item.type === 'Alert' && item.props.color === 'yellow'));
});

test('partial update failure still invalidates the library and prevents an implicit fallback source', async () => {
    const app = fixture();
    app.open();
    let count = 0;
    app.api.post = async (...args) => { app.calls.push(['POST', ...args]); if (++count === 2) throw new Error('network fixture'); return { data: { response: {} } }; };
    await assert.rejects(app.mutation().mutationFn(), /network fixture/);
    await app.mutation().onSettled();
    assert.deepEqual(app.calls.at(-1), ['INVALIDATE', { queryKey: ['template-geofiles'] }]);
    assert.equal(app.calls.filter(call => call[0] === 'POST').length, 2);
    app.query.isSuccess = false;
    app.query.isError = true;
    assert.equal(app.render().find(item => item.type === 'Button').props.disabled, true);
});


test('background refresh timestamps do not remount a source editor or discard its draft', () => {
    const app = fixture();
    app.query.data = [{ id: 'owned', kind: 'geoip', refresh: { sourceUrl: app.presets[0].url, enabled: true, intervalSeconds: 86400, lastSuccessAt: '2026-11-01T00:00:00Z' } }];
    const before = app.open().find(item => item.type === 'RefreshSettings');
    app.query.data[0] = { ...app.query.data[0], refresh: { ...app.query.data[0].refresh, lastSuccessAt: '2026-11-02T00:00:00Z', nextRefreshAt: '2026-11-03T00:00:00Z' } };
    const after = app.render().find(item => item.type === 'RefreshSettings');
    assert.equal(after.key, before.key);
    assert.notEqual(after.props.refresh.lastSuccessAt, before.props.refresh.lastSuccessAt);
});

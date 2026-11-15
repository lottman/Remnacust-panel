const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');
const ts = require('typescript');
const { MutationObserver, QueryClient } = require('@tanstack/react-query');

const frontend = path.resolve(__dirname, '..');
const settingsDirectory = path.join(frontend, 'src/shared/api/hooks/subscription-settings');
function loadTypeScript(filename, mocks = {}) {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const ref = { exports: {} };
    new Function('require', 'module', 'exports', output)(name => {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        return require(name);
    }, ref, ref.exports);
    return ref.exports;
}
const state = loadTypeScript(path.join(settingsDirectory, 'subscription-settings-state.ts'));
function actualMutationConfiguration() {
    return loadTypeScript(path.join(settingsDirectory, 'subscription-settings.mutation.hooks.ts'), {
        '@mantine/notifications': { notifications: { show() {} } },
        '@remnawave/backend-contract': { UpdateSubscriptionSettingsCommand: { endpointDetails: {} } },
        i18next: { t: key => key },
        '@shared/utils/translate-mutation-message': { translateMutationMessage: value => value },
        '../../tsq-helpers': { createMutationHook: options => options },
        './subscription-settings-state': state,
    }).useUpdateSubscriptionSettings;
}

for (const ready of [false, true]) {
    for (const master of [false, true]) {
        for (const compiled of [false, true]) {
            for (const json of [false, true]) {
                test(`settings readiness=${ready} master=${master} compiled=${compiled} JSON=${json}`, () => {
                    const input = Object.freeze({
                        geofilesSystemEnabled: master,
                        geofilesEnabled: compiled,
                        serveJsonAtBaseSubscription: json,
                    });
                    const actual = state.getGeofilesSettingsState(input, ready);
                    assert.equal(actual.systemEnabled, master);
                    assert.equal(actual.jsonEnabled, json);
                    assert.equal(actual.canUpdateFiles, ready && master);
                    assert.equal(actual.canGenerateClientSettings, ready && master && json);
                    assert.equal(actual.canEnableSystem, ready && json);
                });
            }
        }
    }
}

test('unknown, loading and failed settings never authorize DAT operations', () => {
    for (const input of [undefined, {}, { geofilesEnabled: true }]) {
        for (const ready of [false, true]) {
            const result = state.getGeofilesSettingsState(input, ready);
            assert.equal(result.canUpdateFiles, false);
            assert.equal(result.canGenerateClientSettings, false);
        }
    }
    const stale = state.getGeofilesSettingsState({
        geofilesSystemEnabled: true,
        geofilesEnabled: true,
        serveJsonAtBaseSubscription: true,
    }, false);
    assert.equal(stale.canUpdateFiles, false);
    assert.equal(stale.canGenerateClientSettings, false);
});

test('actual production settings mutation selects one shared key and serial scope', () => {
    const { rMutationParams } = actualMutationConfiguration();
    assert.deepEqual(rMutationParams.mutationKey, state.SUBSCRIPTION_SETTINGS_MUTATION_KEY);
    assert.equal(typeof rMutationParams.scope?.id, 'string');
    assert.ok(rMutationParams.scope.id.length > 0);
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label, timeout = 5000) {
    const expires = Date.now() + timeout;
    do {
        if (await predicate()) return;
        await sleep(10);
    } while (Date.now() < expires);
    throw new Error('Timed out waiting for ' + label);
}
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

test('actual mutation scope serializes full snapshots through completion of confirmation callbacks', async () => {
    const configuration = actualMutationConfiguration().rMutationParams;
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const key = ['subscriptionSettings', 'getSubscriptionSettings'];
    const initial = {
        uuid: 'settings-fixture', geofilesSystemEnabled: true, geofilesEnabled: false,
        serveJsonAtBaseSubscription: true, geofilesInlineRuleLimit: 20000,
    };
    let server = { ...initial };
    client.setQueryData(key, initial);
    const requests = [];
    const confirmFirst = deferred();
    const callbacks = [];
    const options = {
        ...configuration,
        mutationFn: input => new Promise((resolve, reject) => {
            requests.push({ input, reject, resolve() {
                server = { ...server, ...input.variables };
                resolve({ ...server });
            } });
        }),
        onSuccess: async (data, variables, context) => {
            await configuration.onSuccess?.(data, variables, context, client);
            await client.cancelQueries({ queryKey: key });
            client.setQueryData(key, data);
            callbacks.push(variables.variables);
            if (callbacks.length === 1) await confirmFirst.promise;
        },
    };
    const first = new MutationObserver(client, options);
    const second = new MutationObserver(client, options);
    const writes = [first.mutate({ variables: { geofilesSystemEnabled: false } })];
    writes[0].catch(() => {});
    try {
        await until(() => requests.length === 1, 'first real MutationObserver request');
        writes.push(second.mutate({ variables: { geofilesInlineRuleLimit: 30000 } }));
        writes[1].catch(() => {});
        await sleep(20);
        assert.equal(requests.length, 1, 'second settings PATCH waits for the first');
        assert.equal(second.getCurrentResult().isPaused, true);
        assert.equal(client.isMutating({ mutationKey: state.SUBSCRIPTION_SETTINGS_MUTATION_KEY }), 2);
        assert.deepEqual(client.getQueryData(key), initial, 'pending writes are not optimistic');
        requests[0].resolve();
        await until(() => callbacks.length === 1, 'first confirmed flat snapshot');
        assert.equal(requests.length, 1, 'queue waits for the async confirmation callback');
        assert.equal(client.getQueryData(key).geofilesSystemEnabled, false);
        confirmFirst.resolve();
        await until(() => requests.length === 2, 'second queued request');
        requests[1].resolve();
        await Promise.all(writes);
        assert.deepEqual(client.getQueryData(key), {
            ...initial, geofilesSystemEnabled: false, geofilesInlineRuleLimit: 30000,
        });
        assert.equal(client.getQueryData(key).response, undefined);
    } finally {
        confirmFirst.resolve();
        for (const request of requests) request.reject(new Error('Synthetic cleanup'));
        await Promise.allSettled(writes);
        client.clear();
    }
});

test('a rejected serialized write retains confirmed state and releases the next writer', async () => {
    const configuration = actualMutationConfiguration().rMutationParams;
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const key = ['subscriptionSettings', 'getSubscriptionSettings'];
    const initial = { geofilesSystemEnabled: true, geofilesEnabled: false, serveJsonAtBaseSubscription: true };
    client.setQueryData(key, initial);
    const gate = deferred();
    let secondStarted = false;
    let errors = 0;
    const first = new MutationObserver(client, {
        ...configuration,
        mutationFn: () => gate.promise,
        onError: async (...args) => { errors++; await configuration.onError?.(...args); },
    });
    const second = new MutationObserver(client, {
        ...configuration,
        mutationFn: async () => { secondStarted = true; return { ...initial, geofilesInlineRuleLimit: 30000 }; },
        onSuccess: data => client.setQueryData(key, data),
    });
    const failed = first.mutate({ variables: { geofilesSystemEnabled: false } });
    failed.catch(() => {});
    const queued = second.mutate({ variables: { geofilesInlineRuleLimit: 30000 } });
    try {
        await sleep(20);
        assert.equal(secondStarted, false);
        assert.deepEqual(client.getQueryData(key), initial);
        gate.reject(new Error('Synthetic settings failure'));
        await assert.rejects(failed, /Synthetic settings failure/);
        await queued;
        assert.equal(errors, 1);
        assert.equal(client.getQueryData(key).geofilesSystemEnabled, true);
        assert.equal(client.getQueryData(key).geofilesEnabled, false);
        assert.equal(client.getQueryData(key).serveJsonAtBaseSubscription, true);
    } finally {
        gate.reject(new Error('Synthetic cleanup'));
        await Promise.allSettled([failed, queued]);
        client.clear();
    }
});

function browserFactory() {
    const helper = path.join(frontend, 'tests/fixtures/node-wizard/cdp.cjs');
    const cache = path.join(frontend, 'node_modules/.cache/geofiles-settings-browser');
    fs.mkdirSync(cache, { recursive: true });
    const ref = { exports: {} };
    new Function('require', 'module', 'exports', '__dirname', fs.readFileSync(helper, 'utf8'))(
        require, ref, ref.exports, cache,
    );
    return ref.exports.launchBrowser;
}

async function localFixture(t) {
    const url = 'http://127.0.0.1:4349/';
    const available = async () => {
        try { return (await fetch(url, { signal: AbortSignal.timeout(500) })).ok; }
        catch { return false; }
    };
    if (!await available()) {
        let output = '';
        const server = spawn(process.execPath, [
            path.join(frontend, 'node_modules/vite/bin/vite.js'),
            '--config', 'tests/fixtures/geofiles-settings/vite.config.ts', '--configLoader', 'runner',
        ], { cwd: frontend, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        server.stdout.on('data', chunk => { output = (output + chunk).slice(-20000); });
        server.stderr.on('data', chunk => { output = (output + chunk).slice(-20000); });
        t.after(() => server.kill());
        await until(async () => {
            if (server.exitCode !== null) throw new Error('Fixture Vite exited: ' + output);
            return available();
        }, 'loopback fixture on reserved port 4349', 30000);
    }
    return url;
}

test('real Mantine DOM and React Query settings regression', {
    skip: process.env.GEOFILES_SETTINGS_BROWSER !== '1' ? 'Set GEOFILES_SETTINGS_BROWSER=1 for local Chromium DOM checks' : false,
}, async t => {
    const url = await localFixture(t);
    const browser = await browserFactory()();
    t.after(() => browser.close());
    const page = (fn, value) => browser.evaluate(`(${fn})(${JSON.stringify(value)})`);
    const open = async (query = '') => {
        await browser.send('Page.navigate', { url: url + query });
        await browser.waitFor('!!window.geofilesSettingsFixture && !!document.querySelector("[data-testid=additional-settings] input")', 30000);
        await browser.waitFor('window.geofilesSettingsFixture.snapshot().query?.fetchStatus === "idle"');
    };
    const reset = async values => {
        await page(async input => window.geofilesSettingsFixture.reset(input), values ?? {});
        await browser.waitFor('window.geofilesSettingsFixture.snapshot().query?.status === "success" && window.geofilesSettingsFixture.snapshot().query?.fetchStatus === "idle"');
    };
    const expand = async () => {
        await page(() => {
            const button = document.querySelector('[data-testid=additional-settings] button[aria-expanded]');
            if (button.getAttribute('aria-expanded') !== 'true') button.click();
        });
        await browser.waitFor('document.querySelectorAll("[data-testid=additional-settings] input[value*=Loyalsoldier]").length === 2');
        await browser.waitFor('!window.geofilesSettingsFixture.snapshot().pending.some(call => call.operation === "filesGET")');
    };
    const clickButton = (key, scope = 'additional-settings', index = 0) => page(input => {
        const root = document.querySelector(`[data-testid="${input.scope}"]`);
        const label = window.geofilesSettingsFixture.i18n.t(input.key);
        const button = [...root.querySelectorAll('button')].filter(value => value.textContent.trim().startsWith(label))[input.index];
        if (!button) throw new Error('Missing real button: ' + input.key);
        button.click();
    }, { key, scope, index });
    const clickMaster = () => page(() => document.querySelectorAll('[data-testid=additional-settings] input')[1].click());
    const fill = async (selector, value) => {
        await page(selector => {
            const input = document.querySelector(selector);
            if (!input) throw new Error('Missing real input: ' + selector);
            input.focus();
            input.select();
        }, selector);
        await browser.send('Input.insertText', { text: String(value) });
    };
    const snapshot = () => page(() => window.geofilesSettingsFixture.snapshot());
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
    await open();

    await t.test('screenshot flags use the flat shared cache and fetch no default files while closed', async () => {
        const result = await page(() => {
            const f = window.geofilesSettingsFixture;
            const inputs = [...document.querySelectorAll('[data-testid=additional-settings] input')];
            return {
                json: { checked: inputs[0].checked, disabled: inputs[0].disabled },
                master: { checked: inputs[1].checked, disabled: inputs[1].disabled },
                snapshot: f.snapshot(),
            };
        });
        assert.deepEqual(result.json, { checked: true, disabled: true });
        assert.deepEqual(result.master, { checked: true, disabled: false });
        assert.equal(result.snapshot.cache.geofilesSystemEnabled, true);
        assert.equal(result.snapshot.cache.geofilesEnabled, false);
        assert.equal(result.snapshot.cache.serveJsonAtBaseSubscription, true);
        assert.equal(result.snapshot.cache.response, undefined);
        assert.equal(result.snapshot.calls.some(call => call.operation === 'filesGET'), false);
    });

    await t.test('accordion loads real default schedule widgets from the canonical preset sources', async () => {
        await page(() => document.querySelector('[data-testid=additional-settings] button[aria-expanded]').click());
        await browser.waitFor('document.querySelectorAll("[data-testid=additional-settings] input[type=url], [data-testid=additional-settings] input[value*=Loyalsoldier]").length === 2');
        await browser.waitFor('(() => { const control = document.querySelector("[data-testid=additional-settings] button[aria-expanded]"); return document.getElementById(control.getAttribute("aria-controls")).getBoundingClientRect().height > 0; })()');
        const result = await page(() => {
            const f = window.geofilesSettingsFixture;
            const control = document.querySelector('[data-testid=additional-settings] button[aria-expanded]');
            const panel = document.getElementById(control.getAttribute('aria-controls'));
            return {
                expanded: control.getAttribute('aria-expanded'),
                height: panel.getBoundingClientRect().height,
                inputs: [...panel.querySelectorAll('input')].map(input => ({ value: input.value, disabled: input.disabled })),
                text: panel.innerText,
                sources: f.defaultSources,
                snapshot: f.snapshot(),
            };
        });
        assert.equal(result.expanded, 'true');
        assert.equal(result.inputs.length, 6);
        assert.ok(result.height > 0);
        for (const source of result.sources) {
            assert.ok(result.text.includes(source.name));
            assert.ok(result.inputs.some(input => input.value === source.url));
        }
        assert.deepEqual(result.snapshot.files.map(file => file.categories), [['ru'], ['category-ru']]);
        assert.equal(result.snapshot.calls.filter(call => call.operation === 'filesGET').length, 1);
        assert.equal(result.snapshot.calls.some(call => call.method !== 'GET'), false);
    });

    if (process.env.GEOFILES_SETTINGS_BASELINE === '1') {
        await t.test('baseline probe reports DOM connectivity on close and reopen', async () => {
            const result = await page(async () => {
                const select = () => document.querySelector('[data-testid=additional-settings] button[aria-expanded]');
                const original = select();
                original.click();
                await new Promise(resolve => setTimeout(resolve, 400));
                const control = select();
                const panel = document.getElementById(control.getAttribute('aria-controls'));
                const closed = { expanded: control.getAttribute('aria-expanded'), inputs: panel.querySelectorAll('input').length, height: panel.getBoundingClientRect().height, originalConnected: original.isConnected, sameControl: original === control };
                select().click();
                await new Promise(resolve => setTimeout(resolve, 400));
                const reopened = select();
                const openPanel = document.getElementById(reopened.getAttribute('aria-controls'));
                return { closed, opened: { expanded: reopened.getAttribute('aria-expanded'), inputs: openPanel.querySelectorAll('input').length, height: openPanel.getBoundingClientRect().height }, snapshot: window.geofilesSettingsFixture.snapshot() };
            });
            t.diagnostic(JSON.stringify(result));
            assert.equal(result.closed.expanded, 'false');
            assert.equal(result.opened.expanded, 'true');
            assert.equal(result.opened.inputs, 6);
            const cycles = await page(() => window.geofilesSettingsFixture.cycleAccordion(2));
            assert.equal(cycles.samples.length, 2);
            for (const sample of cycles.samples) {
                assert.equal(sample.opened.expanded, true);
                assert.equal(sample.opened.inputs, 6);
                assert.equal(sample.closed.expanded, false);
                assert.equal(sample.closed.height, 0);
            }
            t.diagnostic(JSON.stringify(cycles));
        });
    } else {
        await t.test('all flag combinations gate DAT writes by master while leaving compiled and JSON unchanged', async () => {
            for (const master of [false, true]) {
                for (const compiled of [false, true]) {
                    for (const json of [false, true]) {
                        await reset({ geofilesSystemEnabled: master, geofilesEnabled: compiled, serveJsonAtBaseSubscription: json });
                        await expand();
                        const result = await page(() => {
                            const root = document.querySelector('[data-testid=additional-settings]');
                            const f = window.geofilesSettingsFixture;
                            const switches = [...root.querySelectorAll('input')];
                            const update = [...root.querySelectorAll('button')].find(button => button.textContent.trim() === f.i18n.t('geofiles.defaults-update'));
                            return { jsonChecked: switches[0].checked, jsonDisabled: switches[0].disabled, masterChecked: switches[1].checked, updateDisabled: update.disabled, snapshot: f.snapshot() };
                        });
                        assert.equal(result.masterChecked, master);
                        assert.equal(result.jsonChecked, json);
                        assert.equal(result.jsonDisabled, master && json);
                        assert.equal(result.updateDisabled, !master, `master=${master} compiled=${compiled} JSON=${json}`);
                        assert.equal(result.snapshot.cache.geofilesEnabled, compiled);
                        assert.equal(result.snapshot.calls.some(call => call.method !== 'GET'), false);
                    }
                }
            }
        });

        await t.test('JSON lock hint belongs to the JSON description in every language', async () => {
            for (const language of ['en', 'ru', 'fa', 'zh']) {
                await open('?lang=' + language);
                const result = await page(() => {
                    const f = window.geofilesSettingsFixture;
                    const inputs = [...document.querySelectorAll('[data-testid=additional-settings] input')];
                    const hint = f.i18n.t('geofiles.disable-before-json');
                    return {
                        jsonDescription: inputs[0].closest('.mantine-Switch-root').textContent,
                        masterDescription: inputs[1].closest('.mantine-Switch-root').textContent,
                        hint,
                        beforeMaster: Boolean(inputs[0].closest('.mantine-Switch-root').compareDocumentPosition(inputs[1]) & Node.DOCUMENT_POSITION_FOLLOWING),
                    };
                });
                assert.ok(!result.hint.startsWith('geofiles.'), language);
                assert.ok(result.jsonDescription.includes(result.hint), language + ': hint explains JSON lock');
                assert.ok(!result.masterDescription.includes(result.hint), language + ': hint does not instruct disabling the enabled master');
                assert.equal(result.beforeMaster, true);
            }
            await open();
        });

        await t.test('the durable ru.html entry selects Russian without query parameters and accepts explicit language overrides', async () => {
            await open('ru.html');
            const russian = await page(() => ({
                documentLanguage: document.documentElement.lang,
                language: window.geofilesSettingsFixture.i18n.language,
                label: document.querySelector('[data-testid=additional-settings] input').labels[0].textContent,
                expected: window.geofilesSettingsFixture.i18n.t('subscription-settings.widget.serve-json-at-base-subscription'),
            }));
            assert.equal(russian.documentLanguage, 'ru');
            assert.equal(russian.language, 'ru');
            assert.ok(russian.label.startsWith(russian.expected));
            await open('ru.html?lang=en');
            assert.equal(await page(() => window.geofilesSettingsFixture.i18n.language), 'en');
            await open();
        });

        await t.test('pending settings PATCH disables sibling controls and remains server-confirmed', async () => {
            await reset();
            await expand();
            await page(() => window.geofilesSettingsFixture.hold('settingsMutation'));
            await clickMaster();
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().pending.some(call => call.operation === "settingsMutation")');
            const pending = await page(() => ({
                snapshot: window.geofilesSettingsFixture.snapshot(),
                disabled: [
                    ...[...document.querySelectorAll('[data-testid=additional-settings] input')].slice(0, 2),
                    ...document.getElementById(document.querySelector('[data-testid=additional-settings] button[aria-expanded]').getAttribute('aria-controls')).querySelectorAll('input'),
                    ...document.querySelectorAll('[data-testid=inline-settings] input'),
                ].map(input => input.disabled),
            }));
            assert.equal(pending.snapshot.cache.geofilesSystemEnabled, true);
            assert.ok(pending.disabled.every(Boolean));
            await clickMaster();
            await clickButton('geofiles.defaults-update');
            assert.equal((await snapshot()).calls.filter(call => call.operation === 'settingsMutation').length, 1);
            assert.equal((await snapshot()).calls.some(call => call.operation === 'fileMutation'), false);
            await page(() => window.geofilesSettingsFixture.resolveAll('settingsMutation'));
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().cache.geofilesSystemEnabled === false && window.geofilesSettingsFixture.snapshot().query.fetchStatus === "idle"');
            const result = await snapshot();
            assert.equal(result.cache.geofilesEnabled, false);
            assert.equal(result.cache.serveJsonAtBaseSubscription, true);
            assert.equal(result.outerSubmits, 0);
            assert.deepEqual(result.calls.find(call => call.operation === 'settingsMutation').body, { uuid: result.settings.uuid, geofilesSystemEnabled: false });
        });

        await t.test('rejected settings PATCH keeps the confirmed flags and exposes a retryable error', async () => {
            await reset();
            await page(() => window.geofilesSettingsFixture.hold('settingsMutation'));
            await clickMaster();
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().pending.some(call => call.operation === "settingsMutation")');
            await page(() => {
                const f = window.geofilesSettingsFixture;
                f.reject(f.snapshot().pending.find(call => call.operation === 'settingsMutation').id, 'Synthetic denied settings write');
            });
            await browser.waitFor('!!document.querySelector("[data-testid=additional-settings] [role=alert]")');
            const result = await snapshot();
            assert.equal(result.cache.geofilesSystemEnabled, true);
            assert.equal(result.cache.geofilesEnabled, false);
            assert.equal(result.cache.serveJsonAtBaseSubscription, true);
            assert.equal(result.outerSubmits, 0);
            assert.equal(result.calls.filter(call => call.operation === 'settingsMutation').length, 1);
        });

        await t.test('a stale settings GET is canceled before the confirmed PATCH snapshot reaches the cache', async () => {
            await reset();
            await page(() => {
                const f = window.geofilesSettingsFixture;
                f.hold('settingsGET');
                f.hold('settingsMutation');
                void f.refetchSettings();
            });
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().pending.some(call => call.operation === "settingsGET")');
            const oldRead = (await snapshot()).pending.find(call => call.operation === 'settingsGET').id;
            await clickMaster();
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().pending.some(call => call.operation === "settingsMutation")');
            await page(() => window.geofilesSettingsFixture.resolveAll('settingsMutation'));
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().cache.geofilesSystemEnabled === false');
            const confirmed = await snapshot();
            assert.equal(confirmed.calls.find(call => call.id === oldRead).status, 'aborted');
            assert.equal(confirmed.pending.some(call => call.id === oldRead), false);
            assert.equal(confirmed.cache.geofilesEnabled, false);
            assert.equal(confirmed.cache.serveJsonAtBaseSubscription, true);
            await page(() => {
                const f = window.geofilesSettingsFixture;
                f.hold('settingsGET', false);
                f.resolveAll('settingsGET');
            });
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().query.fetchStatus === "idle"');
            assert.equal((await snapshot()).cache.geofilesSystemEnabled, false);
        });

        await t.test('competing real widget writes queue through the production scope without reverting confirmed flags', async () => {
            await reset();
            await page(() => {
                const f = window.geofilesSettingsFixture;
                const inputs = document.querySelectorAll('[data-testid=additional-settings] input');
                inputs[inputs.length - 2].click();
                f.hold('settingsMutation');
            });
            await clickMaster();
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().pending.some(call => call.operation === "settingsMutation")');
            await page(() => document.querySelector('[data-testid=additional-settings] form').requestSubmit());
            await browser.waitFor('window.geofilesSettingsFixture.queryClient.getMutationCache().getAll().some(mutation => mutation.state.isPaused)');
            const queued = await snapshot();
            assert.equal(queued.calls.filter(call => call.operation === 'settingsMutation').length, 1);
            assert.equal(queued.cache.geofilesSystemEnabled, true);
            await page(() => window.geofilesSettingsFixture.resolveAll('settingsMutation'));
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().pending.some(call => call.operation === "settingsMutation" && call.body.randomizeHosts === true)');
            const firstConfirmed = await snapshot();
            assert.equal(firstConfirmed.cache.geofilesSystemEnabled, false);
            assert.equal(firstConfirmed.cache.randomizeHosts, false);
            await page(() => window.geofilesSettingsFixture.resolveAll('settingsMutation'));
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().cache.randomizeHosts === true && window.geofilesSettingsFixture.snapshot().query.fetchStatus === "idle"');
            const result = await snapshot();
            assert.equal(result.cache.geofilesSystemEnabled, false);
            assert.equal(result.cache.geofilesEnabled, false);
            assert.equal(result.cache.serveJsonAtBaseSubscription, true);
            assert.equal(result.outerSubmits, 1);
            assert.deepEqual(result.calls.filter(call => call.operation === 'settingsMutation').map(call => call.body), [
                { uuid: result.settings.uuid, geofilesSystemEnabled: false },
                { uuid: result.settings.uuid, randomizeHosts: true, isShowCustomRemarks: false },
            ]);
        });

        await t.test('cold delayed GET exposes loading, failure and retry without issuing settings or file writes', async () => {
            await browser.send('Page.navigate', { url: url + '?cold&holdGET' });
            await browser.waitFor('!!window.geofilesSettingsFixture && !!document.querySelector("[data-testid=additional-settings] [role=status]")');
            await page(() => document.querySelector('[data-testid=additional-settings] button[aria-expanded]').click());
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().pending.some(call => call.operation === "settingsGET")');
            await clickButton('geofiles.defaults-update');
            assert.equal((await snapshot()).calls.some(call => call.method !== 'GET'), false);
            await page(() => {
                const f = window.geofilesSettingsFixture;
                f.reject(f.snapshot().pending.find(call => call.operation === 'settingsGET').id, 'Synthetic initial settings failure');
            });
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().query.status === "error"');
            assert.equal((await snapshot()).cache, undefined);
            await clickButton('geofiles.defaults-update');
            assert.equal((await snapshot()).calls.some(call => call.method !== 'GET'), false);
            await page(() => window.geofilesSettingsFixture.hold('settingsGET', false));
            await clickButton('common.action.refresh');
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().query.status === "success"');
            assert.equal((await snapshot()).cache.geofilesSystemEnabled, true);
        });

        await t.test('failed background GET disables actions even while old settings data remain visible', async () => {
            await open();
            await expand();
            await page(() => {
                const f = window.geofilesSettingsFixture;
                f.hold('settingsGET');
                void f.refetchSettings();
            });
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().pending.some(call => call.operation === "settingsGET")');
            await page(() => {
                const f = window.geofilesSettingsFixture;
                f.reject(f.snapshot().pending.find(call => call.operation === 'settingsGET').id, 'Synthetic stale settings failure');
            });
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().query.status === "error"');
            const result = await page(() => {
                const f = window.geofilesSettingsFixture;
                const root = document.querySelector('[data-testid=additional-settings]');
                const button = [...root.querySelectorAll('button')].find(button => button.textContent.trim() === f.i18n.t('geofiles.defaults-update'));
                return { master: root.querySelectorAll('input')[1].disabled, defaults: button.disabled, snapshot: f.snapshot() };
            });
            assert.equal(result.master, true);
            assert.equal(result.defaults, true);
            assert.equal(result.snapshot.cache.geofilesSystemEnabled, true);
            await clickButton('geofiles.defaults-update');
            assert.equal((await snapshot()).calls.some(call => call.method !== 'GET'), false);
        });

        await t.test('closing and reopening preserves the real input node, schedule draft and cached file list', async () => {
            await open();
            await expand();
            const interval = '[data-testid=additional-settings] .mantine-NumberInput-input';
            await fill(interval, '360');
            const before = (await snapshot()).calls.filter(call => call.operation === 'filesGET').length;
            await page(() => {
                window.__geofilesDraftInput = document.querySelector('[data-testid=additional-settings] .mantine-NumberInput-input');
                document.querySelector('[data-testid=additional-settings] button[aria-expanded]').click();
            });
            const during = await page(async () => {
                await new Promise(resolve => requestAnimationFrame(resolve));
                const input = window.__geofilesDraftInput;
                return { connected: input.isConnected, value: input.value, inputs: document.querySelectorAll('[data-testid=additional-settings] input').length };
            });
            assert.equal(during.connected, true);
            assert.equal(during.value, '360');
            assert.equal(during.inputs, 10);
            await page(() => document.querySelector('[data-testid=additional-settings] button[aria-expanded]').click());
            await browser.waitFor('document.querySelector("[data-testid=additional-settings] button[aria-expanded]").getAttribute("aria-expanded") === "true"');
            assert.equal(await page(() => window.__geofilesDraftInput === document.querySelector('[data-testid=additional-settings] .mantine-NumberInput-input')), true);
            assert.equal((await snapshot()).calls.filter(call => call.operation === 'filesGET').length, before);
            const cycles = await page(() => window.geofilesSettingsFixture.cycleAccordion(2));
            for (const sample of cycles.samples) {
                assert.equal(sample.opened.inputs, 6);
                assert.equal(sample.closed.inputs, 6);
                assert.equal(sample.closed.height, 0);
            }
        });

        await t.test('schedule save and refresh affect the file API without submitting the outer settings form', async () => {
            await reset();
            await expand();
            await fill('[data-testid=additional-settings] .mantine-NumberInput-input', '360');
            await clickButton('geofiles.save-refresh');
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().calls.some(call => call.method === "PATCH" && call.operation === "fileMutation" && call.status === "success")');
            const saved = await snapshot();
            const patch = saved.calls.find(call => call.method === 'PATCH' && call.operation === 'fileMutation');
            assert.equal(patch.body.intervalSeconds, 360 * 60);
            assert.equal(patch.body.sourceUrl, saved.files[0].refresh.sourceUrl);
            assert.equal(saved.outerSubmits, 0);
            assert.equal(saved.calls.some(call => call.operation === 'settingsMutation'), false);
            await clickButton('common.action.refresh');
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().calls.some(call => call.method === "POST" && call.operation === "fileMutation" && call.status === "success")');
            assert.equal((await snapshot()).outerSubmits, 0);
        });

        await t.test('a collapsed retained panel defers invalidated file reads until it is reopened', async () => {
            await reset();
            await expand();
            const before = (await snapshot()).calls.filter(call => call.operation === 'filesGET').length;
            await page(async () => {
                document.querySelector('[data-testid=additional-settings] button[aria-expanded]').click();
                await new Promise(resolve => requestAnimationFrame(resolve));
                await window.geofilesSettingsFixture.queryClient.invalidateQueries({ queryKey: ['template-geofiles'] });
            });
            assert.equal((await snapshot()).calls.filter(call => call.operation === 'filesGET').length, before);
            await expand();
            assert.equal((await snapshot()).calls.filter(call => call.operation === 'filesGET').length, before + 1);
        });

        await t.test('default updates refresh full DAT sources when master is ON and compiled is OFF', async () => {
            await reset();
            await expand();
            await clickButton('geofiles.defaults-update');
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().calls.filter(call => call.operation === "fileMutation" && call.status === "success").length === 2');
            const result = await snapshot();
            assert.deepEqual(result.calls.filter(call => call.operation === 'fileMutation').map(call => call.url), result.files.map(file => `/api/geofiles/${file.id}/refresh`));
            assert.equal(result.outerSubmits, 0);
            assert.equal(result.calls.some(call => call.operation === 'settingsMutation'), false);
            assert.equal(result.cache.geofilesEnabled, false);
            assert.equal(result.cache.serveJsonAtBaseSubscription, true);
        });

        await t.test('default imports use canonical names, kinds and sources without fetching a real backend', async () => {
            await reset();
            await page(() => window.geofilesSettingsFixture.setFiles([], { publish: false }));
            await page(() => document.querySelector('[data-testid=additional-settings] button[aria-expanded]').click());
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().calls.some(call => call.operation === "filesGET" && call.status === "success")');
            await clickButton('geofiles.defaults-update');
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().calls.filter(call => call.url === "/api/geofiles/import" && call.status === "success").length === 2');
            const result = await page(() => ({ snapshot: window.geofilesSettingsFixture.snapshot(), sources: window.geofilesSettingsFixture.defaultSources }));
            assert.deepEqual(result.snapshot.calls.filter(call => call.url === '/api/geofiles/import').map(call => call.body), result.sources.map(source => ({ name: source.name, kind: source.kind, url: source.url })));
            assert.equal(result.snapshot.outerSubmits, 0);
        });

        await t.test('partial default refresh failure stops the sequence and invalidates the file list', async () => {
            await reset();
            await expand();
            const before = (await snapshot()).calls.filter(call => call.operation === 'filesGET').length;
            await page(() => window.geofilesSettingsFixture.hold('fileMutation'));
            await clickButton('geofiles.defaults-update');
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().pending.some(call => call.operation === "fileMutation")');
            await page(() => window.geofilesSettingsFixture.resolveAll('fileMutation'));
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().pending.some(call => call.operation === "fileMutation")');
            await page(() => {
                const f = window.geofilesSettingsFixture;
                f.reject(f.snapshot().pending.find(call => call.operation === 'fileMutation').id, 'Synthetic second default refresh failure');
            });
            await browser.waitFor('!window.geofilesSettingsFixture.queryClient.isMutating({ mutationKey: ["template-geofiles", "defaults-update"] })');
            const result = await snapshot();
            assert.deepEqual(result.calls.filter(call => call.operation === 'fileMutation').map(call => call.status), ['success', 'error']);
            assert.ok(result.calls.filter(call => call.operation === 'filesGET').length > before);
            assert.equal(result.calls.some(call => call.operation === 'settingsMutation'), false);
            assert.equal(result.outerSubmits, 0);
        });

        await t.test('a failed settings read between batch POSTs stops the remaining update despite the retained ON master', async () => {
            await reset();
            await expand();
            const before = await snapshot();
            await page(() => window.geofilesSettingsFixture.hold('fileMutation'));
            await clickButton('geofiles.defaults-update');
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().pending.some(call => call.operation === "fileMutation")');
            assert.equal((await snapshot()).calls.filter(call => call.operation === 'fileMutation').length, 1);
            await page(() => {
                const f = window.geofilesSettingsFixture;
                f.hold('settingsGET');
                void f.refetchSettings();
            });
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().pending.some(call => call.operation === "settingsGET")');
            await page(() => {
                const f = window.geofilesSettingsFixture;
                f.reject(f.snapshot().pending.find(call => call.operation === 'settingsGET').id, 'Synthetic settings failure during a full DAT update');
            });
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().query.status === "error"');
            const failed = await snapshot();
            assert.equal(failed.cache.geofilesSystemEnabled, true);
            assert.deepEqual(failed.cache, before.cache);
            assert.equal(failed.pending.filter(call => call.operation === 'fileMutation').length, 1);
            await page(() => window.geofilesSettingsFixture.resolveAll('fileMutation'));
            await browser.waitFor('!window.geofilesSettingsFixture.queryClient.isMutating({ mutationKey: ["template-geofiles", "defaults-update"] })');
            const stopped = await snapshot();
            assert.deepEqual(stopped.calls.filter(call => call.operation === 'fileMutation').map(call => call.status), ['success'], 'the second full DAT POST must not use stale readiness from the batch closure');
            assert.equal(stopped.query.status, 'error');
            assert.deepEqual(stopped.cache, before.cache);
            assert.deepEqual(stopped.files.map(({ id, name, kind, sha256, categories, refresh }) => ({ id, name, kind, sha256, categories, source: refresh.sourceUrl })), before.files.map(({ id, name, kind, sha256, categories, refresh }) => ({ id, name, kind, sha256, categories, source: refresh.sourceUrl })));
            assert.equal(stopped.calls.some(call => call.operation === 'settingsMutation'), false);
            assert.equal(stopped.outerSubmits, 0);
            await page(() => window.geofilesSettingsFixture.hold('settingsGET', false));
            await clickButton('common.action.refresh');
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().query.status === "success"');
            const recovered = await page(() => {
                const f = window.geofilesSettingsFixture;
                const button = [...document.querySelectorAll('[data-testid=additional-settings] button')].find(button => button.textContent.trim() === f.i18n.t('geofiles.defaults-update'));
                return { disabled: button.disabled, snapshot: f.snapshot() };
            });
            assert.equal(recovered.disabled, false);
            assert.deepEqual(recovered.snapshot.cache, before.cache);
        });

        await t.test('inline threshold saves only its setting and confirms the shared flat cache', async () => {
            await reset();
            await fill('[data-testid=inline-settings] input', '30000');
            await page(() => window.geofilesSettingsFixture.hold('settingsMutation'));
            await clickButton('common.action.save', 'inline-settings');
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().pending.some(call => call.operation === "settingsMutation")');
            assert.equal((await snapshot()).cache.geofilesInlineRuleLimit, 20000);
            await page(() => window.geofilesSettingsFixture.resolveAll('settingsMutation'));
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().cache.geofilesInlineRuleLimit === 30000');
            const result = await snapshot();
            assert.deepEqual(result.calls.find(call => call.operation === 'settingsMutation').body, { uuid: result.settings.uuid, geofilesInlineRuleLimit: 30000 });
            assert.equal(result.cache.geofilesSystemEnabled, true);
            assert.equal(result.cache.geofilesEnabled, false);
            assert.equal(result.cache.serveJsonAtBaseSubscription, true);
        });

        await t.test('invalid and rejected inline drafts remain editable without accidental settings writes', async () => {
            await reset();
            await fill('[data-testid=inline-settings] input', '0');
            await clickButton('common.action.save', 'inline-settings');
            assert.equal((await snapshot()).calls.some(call => call.operation === 'settingsMutation'), false);
            await fill('[data-testid=inline-settings] input', '35000');
            await page(() => window.geofilesSettingsFixture.hold('settingsMutation'));
            await clickButton('common.action.save', 'inline-settings');
            await browser.waitFor('window.geofilesSettingsFixture.snapshot().pending.some(call => call.operation === "settingsMutation")');
            await page(() => {
                const f = window.geofilesSettingsFixture;
                f.reject(f.snapshot().pending.find(call => call.operation === 'settingsMutation').id, 'Synthetic threshold failure');
            });
            await browser.waitFor('!document.querySelector("[data-testid=inline-settings] input").disabled');
            assert.equal(await page(() => document.querySelector('[data-testid=inline-settings] input').value), '35000');
            assert.equal((await snapshot()).cache.geofilesInlineRuleLimit, 20000);
        });

        await t.test('system reduced motion reaches the actual panel provider and sets the accordion duration to zero', async () => {
            await open();
            await page(() => window.geofilesSettingsFixture.setAppearance({ reduceMotion: false }));
            await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
            await browser.waitFor('document.documentElement.dataset.panelReducedMotion === "true" && window.geofilesSettingsFixture.appearanceSnapshot().reducedMotion === true');
            const result = await page(() => {
                const root = document.querySelector('[data-testid=additional-settings] .mantine-Accordion-root');
                const control = root.querySelector('button[aria-expanded]');
                const panel = document.getElementById(control.getAttribute('aria-controls'));
                return {
                    media: matchMedia('(prefers-reduced-motion: reduce)').matches,
                    duration: getComputedStyle(root).getPropertyValue('--accordion-transition-duration').trim(),
                    panelDuration: getComputedStyle(panel).transitionDuration,
                    appearance: window.geofilesSettingsFixture.appearanceSnapshot(),
                };
            });
            assert.equal(result.media, true);
            assert.equal(result.appearance.appearance.reduceMotion, false, 'the system preference reaches the real provider independently of the saved app switch');
            assert.equal(result.duration, '0ms');
            assert.ok(result.panelDuration.split(',').every(value => parseFloat(value) === 0));
            const cycles = await page(() => window.geofilesSettingsFixture.cycleAccordion(1));
            assert.equal(cycles.samples[0].opened.inputs, 6);
            assert.equal(cycles.samples[0].closed.inputs, 6);
            assert.equal(cycles.samples[0].closed.height, 0);
            await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
            await browser.waitFor('document.documentElement.dataset.panelReducedMotion === "false"');
        });

        await t.test('the saved application motion setting uses the real provider and survives reload', async () => {
            await open();
            await page(() => window.geofilesSettingsFixture.setAppearance({ reduceMotion: true }));
            await browser.waitFor('document.documentElement.dataset.panelReducedMotion === "true"');
            await open('ru.html');
            const result = await page(() => ({
                media: matchMedia('(prefers-reduced-motion: reduce)').matches,
                appearance: window.geofilesSettingsFixture.appearanceSnapshot(),
                duration: getComputedStyle(document.querySelector('[data-testid=additional-settings] .mantine-Accordion-root')).getPropertyValue('--accordion-transition-duration').trim(),
                direction: document.documentElement.dir,
                theme: document.documentElement.dataset.panelTheme,
            }));
            assert.equal(result.media, false);
            assert.equal(result.appearance.appearance.reduceMotion, true);
            assert.equal(result.appearance.reducedMotion, true);
            assert.equal(result.duration, '0ms');
            assert.equal(result.direction, 'ltr');
            assert.equal(result.theme, 'dark');
            await page(() => window.geofilesSettingsFixture.setAppearance({ reduceMotion: false }));
            await browser.waitFor('document.documentElement.dataset.panelReducedMotion === "false"');
        });

        await t.test('real Masonry uses two desktop columns and one mobile column without overflow', async () => {
            await open();
            for (const width of [1600, 390]) {
                await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
                await sleep(300);
                const result = await page(() => {
                    const first = document.querySelector('[data-testid=additional-settings]').getBoundingClientRect();
                    const second = document.querySelector('[data-testid=companion-card]').getBoundingClientRect();
                    return { first: { x: first.x, y: first.y, width: first.width }, second: { x: second.x, y: second.y, width: second.width }, viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth };
                });
                assert.ok(result.scrollWidth <= width);
                if (width === 1600) assert.ok(result.second.x > result.first.x + result.first.width);
                else {
                    assert.equal(result.second.x, result.first.x);
                    assert.ok(result.second.y > result.first.y);
                }
            }
        });
    }

    assert.deepEqual(browser.consoleErrors, []);
});

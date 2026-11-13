const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const load = require('./load-typescript.cjs');
const directory = path.join(__dirname, '../src/modules/subscription-template');
const { ERRORS } = load(path.join(__dirname, '../libs/contract/constants/errors/errors.ts'));
const contracts = load(
    path.join(__dirname, '../libs/contract/models/xray-json-advanced/remnawave-injector.schema.ts'),
);
const { SubscriptionTemplateService } = load(
    path.join(directory, 'subscription-template.service.ts'),
    {
        '@common/types': {
            ok: (response) => ({ isOk: true, response }),
            fail: (error) => ({ isOk: false, error }),
        },
        '@common/utils': {},
        '@libs/contracts/constants': {
            ERRORS,
            CACHE_KEYS: { SUBSCRIPTION_TEMPLATE: (name) => name },
        },
        '@libs/contracts/models': contracts,
        './constants': {},
        './geofiles/xray-geofile-delivery': { XrayGeofileDelivery: class {} },
        './models/get-templates.response.model': {},
    },
);

function fixture(type = 'XRAY_JSON') {
    let row = {
        uuid: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
        name: 'Saved',
        templateType: type,
        tags: [],
        viewPosition: 1,
        templateJson: { outbounds: [{ tag: 'direct', protocol: 'freedom' }] },
        templateYaml: 'proxies: []\n',
        draftContent: null,
    };
    const history = [],
        invalidated = [];
    const geofiles = {
        withReferenceLock: async (callback) => callback(),
        assertReferences: async () => {},
        prepare: async (config) => config,
    };
    const repository = {
        isGeofilesSystemEnabled: async () => true,
        findByUUID: async () => structuredClone(row),
        update: async (patch) => {
            row = {
                ...row,
                ...Object.fromEntries(
                    Object.entries(patch).filter(([, value]) => value !== undefined),
                ),
            };
            history.push({ ...structuredClone(row), createdAt: new Date() });
            return structuredClone(row);
        },
        getRevisions: async () => history,
        getTemplateByNameAndTypeOrGetDefault: async () => structuredClone(row),
    };
    const service = new SubscriptionTemplateService(
        repository,
        {
            del: async (key) => invalidated.push(key),
            templateSnapshot: async () => ({ generation: 'a'.repeat(32), value: null }),
            setTemplateSnapshot: async () => true,
            invalidateTemplateSnapshots: async () => {},
        },
        geofiles,
    );
    service.logger = { error() {} };
    service.removeCachedTemplate = async (...args) => invalidated.push(args);
    return {
        service,
        geofiles,
        invalidated,
        current: () => structuredClone(row),
        save: (text) => service.updateTemplate(row.uuid, undefined, undefined, undefined, text),
    };
}

function editorSavePayload(text, uuid) {
    let payload;
    const ref = { exports: {} };
    const frontend = path.join(__dirname, '../../frontend');
    const frontendRequire = require('node:module').createRequire(
        path.join(frontend, 'package.json'),
    );
    const mocks = {
        react: { useRef: (value) => ({ current: value }) },
        '@mantine/core': { Button: 'Button', Group: 'Group' },
        '@mantine/hooks': { useClipboard: () => ({}), useDisclosure: () => [false, {}] },
        'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
        '@shared/api': {},
        '@shared/api/hooks': {
            useUpdateSubscriptionTemplate: () => ({
                mutate: (value) => {
                    payload = value.variables;
                },
            }),
        },
        '@shared/hooks': { useIsMobile: () => false },
        '@shared/ui/load-templates/use-download-template': { useDownloadTemplate: () => ({}) },
        './template-editor-actions.module.css': {},
    };
    const filename = path.join(
        frontend,
        'src/features/dashboard/subscription-templates/template-editor-actions/template-editor-actions.feature.tsx',
    );
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.CommonJS,
            esModuleInterop: true,
        },
    }).outputText;
    new Function('require', 'module', 'exports', compiled)(
        (id) => (Object.hasOwn(mocks, id) ? mocks[id] : frontendRequire(id)),
        ref,
        ref.exports,
    );
    const element = ref.exports.TemplateEditorActionsFeature({
        template: { uuid },
        editorType: 'json',
        editorRef: { current: { getValue: () => '{ stale editor value' } },
        getValue: () => text,
        showEditorTools: false,
    });
    element.props.children.find((child) => child?.type === 'Button').props.onClick();
    assert.deepEqual(payload, { uuid, draftContent: text });
    return frontendRequire(
        '@remnawave/backend-contract',
    ).UpdateSubscriptionTemplateCommand.RequestBodySchema.parse(payload);
}

test('malformed JSON and empty text survive server reload and history without replacing live content', async () => {
    for (const raw of ['{ unfinished', '', '[]', 'null']) {
        const f = fixture(),
            live = f.current().templateJson;
        const result = await f.save(raw);
        assert.equal(result.isOk, true);
        assert.equal(result.response.draftContent, raw);
        assert.ok(result.response.validationWarnings.length);
        assert.deepEqual(f.current().templateJson, live);
        assert.equal(
            (await f.service.getTemplateByUuid(f.current().uuid)).response.draftContent,
            raw,
        );
        assert.equal(
            (await f.service.getRevisions(f.current().uuid)).response.at(-1).draftContent,
            raw,
        );
        assert.deepEqual(await f.service.getCachedTemplateByType('XRAY_JSON', 'Saved'), live);
        assert.deepEqual(f.invalidated, []);
    }
});

test('incomplete host selections save drafts with their exact warning paths', async () => {
    for (const [config, warning] of [
        [
            {
                remnawave: {
                    injectHosts: [{ tagPrefix: 'p', selector: { type: 'tags', values: [] } }],
                },
            },
            'remnawave.injectHosts.0.selector.values',
        ],
    ]) {
        const f = fixture(),
            raw = JSON.stringify(config);
        const result = await f.save(raw);
        assert.equal(result.isOk, true);
        assert.equal(f.current().draftContent, raw);
        assert.ok(
            result.response.validationWarnings.includes(warning),
            result.response.validationWarnings.join(', '),
        );
    }
});

test('duplicate prefixes from code save an editable draft with indexed pool warnings, while distinct prefixes publish', async () => {
    const f = fixture();
    const config = {
        remnawave: {
            injectHosts: ['g', 'g-ru', 'g-ru'].map((tagPrefix) => ({
                tagPrefix,
                selector: { type: 'tags', values: ['RU'] },
            })),
        },
    };
    const before = f.current().templateJson;
    const result = await f.save(JSON.stringify(config));
    assert.equal(result.isOk, true);
    assert.deepEqual(result.response.validationWarnings, [
        'remnawave.injectHosts.1.tagPrefix',
        'remnawave.injectHosts.2.tagPrefix',
    ]);
    assert.deepEqual(f.current().templateJson, before);
    config.remnawave.injectHosts[2].tagPrefix = 'g-eu';
    assert.equal((await f.save(JSON.stringify(config))).isOk, true);
    assert.equal(f.current().draftContent, null);
    assert.deepEqual(f.current().templateJson.remnawave.injectHosts, config.remnawave.injectHosts);
});

function leastLoad(tolerance) {
    return {
        outbounds: [{ tag: 'direct', protocol: 'freedom' }],
        routing: {
            balancers: [
                {
                    tag: 'auto',
                    selector: ['direct'],
                    strategy: { type: 'leastLoad', settings: { expected: 2, tolerance } },
                },
            ],
        },
    };
}

test('dangling routing targets keep the live template for both editor drafts and direct API saves', async () => {
    for (const field of ['outboundTag', 'balancerTag']) {
        for (const draft of [false, true]) {
            const f = fixture(),
                live = f.current().templateJson;
            const config = {
                outbounds: [{ tag: 'direct', protocol: 'freedom' }],
                routing: { rules: [{ domain: ['domain:example.test'], [field]: 'removed-pool' }] },
            };
            const result = draft
                ? await f.save(JSON.stringify(config))
                : await f.service.updateTemplate(f.current().uuid, undefined, config);
            assert.equal(result.isOk, draft);
            assert.deepEqual(f.current().templateJson, live);
            assert.deepEqual(f.invalidated, []);
            if (draft)
                assert.deepEqual(result.response.validationWarnings, [`routing.rules.0.${field}`]);
        }
    }
});

test('routing target validation retains implicit proxy, declared outputs and generated pool names', async () => {
    for (const draft of [false, true]) {
        for (const config of [
            {
                outbounds: [],
                routing: { rules: [{ domain: ['domain:example.test'], outboundTag: 'proxy' }] },
            },
            {
                outbounds: [{ tag: 'direct', protocol: 'freedom' }],
                routing: { rules: [{ domain: ['domain:example.test'], outboundTag: 'direct' }] },
            },
            {
                outbounds: [],
                remnawave: {
                    injectHosts: [
                        { tagPrefix: 'pool-eu', selector: { type: 'tags', values: ['EU'] } },
                    ],
                },
                routing: { rules: [{ domain: ['domain:example.test'], outboundTag: 'pool-eu-2' }] },
            },
            {
                outbounds: [],
                remnawave: {
                    injectHosts: [
                        { useHostRemarkAsTag: true, selector: { type: 'tags', values: ['EU'] } },
                    ],
                },
                routing: {
                    rules: [{ domain: ['domain:example.test'], outboundTag: 'dynamic-host-name' }],
                },
            },
            {
                outbounds: [{ tag: 'direct', protocol: 'freedom' }],
                routing: {
                    balancers: [{ tag: 'auto', selector: ['direct'] }],
                    rules: [{ domain: ['domain:example.test'], balancerTag: 'auto' }],
                },
            },
        ]) {
            const f = fixture();
            const result = draft
                ? await f.save(JSON.stringify(config))
                : await f.service.updateTemplate(f.current().uuid, undefined, config);
            assert.equal(result.isOk, true, JSON.stringify(config));
            assert.equal(f.current().draftContent, null);
            assert.deepEqual(f.current().templateJson, config);
        }
    }
});

test('unresolved fallback routes cannot publish through the editor or direct API', async () => {
    for (const draft of [false, true]) {
        const f = fixture(),
            live = f.current().templateJson;
        const config = leastLoad(0.02);
        config.routing.balancers[0].fallbackTag = 'removed-pool';
        const result = draft
            ? await f.save(JSON.stringify(config))
            : await f.service.updateTemplate(f.current().uuid, undefined, config);
        assert.equal(result.isOk, draft);
        assert.deepEqual(f.current().templateJson, live);
        if (draft)
            assert.deepEqual(result.response.validationWarnings, [
                'routing.balancers.0.fallbackTag',
            ]);
    }
    for (const target of ['direct', '']) {
        const f = fixture(),
            config = leastLoad(0.02);
        config.routing.balancers[0].fallbackTag = target;
        assert.equal((await f.save(JSON.stringify(config))).isOk, true);
        assert.equal(f.current().draftContent, null);
    }
});

test('unused prefixes do not block saving when host remarks or tags supply outbound names', async () => {
    for (const mode of ['useHostRemarkAsTag', 'useHostTagAsTag']) {
        for (const inactiveFirst of [false, true]) {
            const f = fixture(),
                config = leastLoad(2);
            const inactive = {
                tagPrefix: 'direct',
                [mode]: true,
                selector: { type: 'tags', values: ['EU'] },
            };
            const active = { tagPrefix: 'direct-2', selector: { type: 'tags', values: ['RU'] } };
            config.remnawave = {
                injectHosts: inactiveFirst ? [inactive, active] : [active, inactive],
            };
            await f.save('{ unfinished');
            const body = editorSavePayload(JSON.stringify(config), f.current().uuid);
            const result = await f.service.updateTemplate(
                body.uuid,
                body.name,
                body.templateJson,
                body.encodedTemplateYaml,
                body.draftContent,
            );
            assert.equal(result.isOk, true);
            assert.equal(result.response.draftContent, null);
            assert.deepEqual(result.response.templateJson, config);
            assert.equal(result.response.validationWarnings, undefined);
            assert.deepEqual(
                (await f.service.getRevisions(f.current().uuid)).response.at(-1).templateJson,
                config,
            );
            assert.deepEqual(await f.service.getCachedTemplateByType('XRAY_JSON', 'Saved'), config);
            assert.equal(f.invalidated.length, 1);
        }
    }
});

test('active prefixes still block static and pool collisions even with a nonfatal tolerance warning', async () => {
    for (const names of [['direct'], ['pool', 'pool'], ['pool', 'pool-2']]) {
        const f = fixture(),
            config = leastLoad(2),
            live = f.current().templateJson;
        config.remnawave = {
            injectHosts: names.map((tagPrefix) => ({
                tagPrefix,
                selector: { type: 'tags', values: ['EU'] },
            })),
        };
        const raw = JSON.stringify(config),
            result = await f.save(raw);
        assert.equal(result.isOk, true);
        assert.equal(result.response.draftContent, raw);
        assert.ok(result.response.validationWarnings.includes('remnawave.injectHosts.0.tagPrefix'));
        assert.deepEqual(f.current().templateJson, live);
        assert.deepEqual(f.invalidated, []);
    }
});

test('finite tolerance outside the range publishes without a warning and preserves native clamping', async () => {
    for (const value of [2, -1]) {
        const f = fixture(),
            config = leastLoad(value);
        await f.save('{ unfinished');
        const result = await f.save(JSON.stringify(config));
        assert.equal(result.isOk, true);
        assert.equal(result.response.draftContent, null);
        assert.deepEqual(result.response.templateJson, config);
        assert.equal(result.response.validationWarnings, undefined);
        assert.equal(f.invalidated.length, 1);
    }
});

test('wrong tolerance types and nonfinite numbers remain saved drafts', async () => {
    for (const raw of [
        JSON.stringify(leastLoad('2')),
        JSON.stringify(leastLoad(null)),
        JSON.stringify(leastLoad(2)).replace('"tolerance":2', '"tolerance":1e400'),
    ]) {
        const f = fixture(),
            live = f.current().templateJson;
        const result = await f.save(raw);
        assert.equal(result.isOk, true);
        assert.equal(result.response.draftContent, raw);
        assert.deepEqual(f.current().templateJson, live);
    }
});

test('warning display limit never publishes a template with blocking validation failures', async () => {
    const config = leastLoad(2),
        f = fixture();
    config.routing.balancers = Array.from({ length: 21 }, (_, index) => ({
        ...leastLoad('bad').routing.balancers[0],
        tag: `auto-${index}`,
    }));
    config.routing.balancers.push({ ...leastLoad('bad').routing.balancers[0], tag: 'bad' });
    const raw = JSON.stringify(config),
        result = await f.save(raw);
    assert.equal(result.isOk, true);
    assert.equal(result.response.draftContent, raw);
    assert.equal(result.response.validationWarnings.length, 20);
});

test('draft database write failure is never reported as saved', async () => {
    const f = fixture();
    f.service.subscriptionTemplateRepository.update = async () => {
        throw Error('database unavailable');
    };
    assert.equal((await f.save('{ broken')).isOk, false);
});

test('fixing a saved draft publishes the config, clears the draft and invalidates the active template cache', async () => {
    const f = fixture();
    await f.save('{ broken');
    const corrected = {
        outbounds: [{ tag: 'direct', protocol: 'freedom' }],
        routing: {
            balancers: [
                {
                    tag: 'auto',
                    selector: ['direct'],
                    strategy: { type: 'leastLoad', settings: { tolerance: 0.02 } },
                },
            ],
        },
    };
    const result = await f.save(JSON.stringify(corrected));
    assert.equal(result.isOk, true);
    assert.equal(result.response.draftContent, null);
    assert.deepEqual(f.current().templateJson, corrected);
    assert.equal(f.invalidated.length, 1);
});

test('YAML syntax and incomplete native groups save drafts without publishing broken provider configs', async () => {
    const f = fixture('MIHOMO'),
        live = f.current().templateYaml;
    for (const raw of [
        'proxies: [',
        'proxy-groups:\n  - name: Auto\n    type: url-test\n    remnawave:\n      pool:\n        selector: {type: tags, values: []}\n',
    ]) {
        assert.equal((await f.save(raw)).isOk, true);
        assert.equal(f.current().draftContent, raw);
        assert.equal(f.current().templateYaml, live);
    }
    assert.equal(
        (await f.save('proxies: []\nrules: [MATCH,DIRECT]\n')).response.draftContent,
        null,
    );
});

test('missing geofiles remain an editable draft and never replace the last usable subscription', async () => {
    const f = fixture(),
        live = f.current().templateJson;
    f.geofiles.prepare = async () => {
        throw Error('geofile not found');
    };
    const raw = JSON.stringify({
        remnacust: { geofiles: [{ id: 'a'.repeat(34), target: 'DIRECT' }] },
    });
    const result = await f.save(raw);
    assert.equal(result.isOk, true);
    assert.deepEqual(result.response.validationWarnings, ['remnacust.geofiles']);
    assert.equal(result.response.draftContent, raw);
    assert.deepEqual(f.current().templateJson, live);
});

test('legacy API validation remains strict and draft payloads cannot combine conflicting content fields', async () => {
    const f = fixture();
    const invalid = { remnawave: { injectHosts: [{ selector: { type: 'tags', values: [] } }] } };
    assert.equal(
        (await f.service.updateTemplate(f.current().uuid, undefined, invalid, undefined)).isOk,
        false,
    );
    assert.equal(
        (await f.service.updateTemplate(f.current().uuid, undefined, {}, undefined, '{ broken'))
            .isOk,
        false,
    );
    assert.equal(f.current().draftContent, null);
});

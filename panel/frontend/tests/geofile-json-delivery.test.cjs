const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function harness(language = 'en', initial = { uuid: 'settings-id', serveJsonAtBaseSubscription: false, other: 'preserved' }) {
    const strings = JSON.parse(fs.readFileSync(path.join(__dirname, `../public/locales/${language}/remnawave.json`), 'utf8'));
    const t = key => {
        const value = key.split('.').reduce((value, part) => value?.[part], strings);
        assert.equal(typeof value, 'string', `Missing ${language} translation: ${key}`);
        return value;
    };
    const key = ['subscriptionSettings', 'getSubscriptionSettings'];
    const events = [];
    const requests = [];
    let callbacks;
    let queryOptions;
    const settings = { data: initial, isSuccess: !!initial, isPending: !initial, isError: false, isFetching: false, refetch: () => events.push('refetch') };
    const update = { isPending: false, isError: false, mutate: request => requests.push(request) };
    const client = {
        async cancelQueries(options) { assert.deepEqual(options.queryKey, key); events.push('cancel'); },
        setQueryData(queryKey, data) { assert.deepEqual(queryKey, key); events.push('confirmed'); settings.data = data; },
        async invalidateQueries(options) { assert.deepEqual(options.queryKey, key); events.push('invalidate'); },
    };
    const mocks = {
        '@mantine/core': Object.fromEntries(['Alert', 'Button', 'Card', 'Loader', 'Stack', 'Switch', 'Text'].map(name => [name, name])),
        '@tanstack/react-query': { useQueryClient: () => client },
        'react-i18next': { useTranslation: () => ({ t }) },
        '@shared/api/hooks/subscription-settings/subscription-settings.query.hooks': {
            subscriptionSettingsQueryKeys: { getSubscriptionSettings: { queryKey: key } },
            useGetSubscriptionSettings: options => { queryOptions = options; return settings; },
        },
        '@shared/api/hooks/subscription-settings/subscription-settings.mutation.hooks': {
            useUpdateSubscriptionSettings: options => { callbacks = options.mutationFns; return update; },
        },
    };
    const source = fs.readFileSync(path.join(__dirname, '../src/shared/ui/subscription-json-delivery/subscription-json-delivery.tsx'), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
    const ref = { exports: {} };
    new Function('require', 'module', 'exports', compiled)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), ref, ref.exports);
    function elements(value) {
        if (Array.isArray(value)) return value.flatMap(elements);
        if (!value || typeof value !== 'object') return [];
        return [value, ...elements(value.props?.children)];
    }
    return { render: () => elements(ref.exports.SubscriptionJsonDelivery()), settings, update, requests, events, t, confirm: data => callbacks.onSuccess(data), options: () => queryOptions };
}

for (const language of ['ru', 'en', 'fa', 'zh']) test(`${language}: switch saves only the global JSON flag and shows server-confirmed state`, async () => {
    const panel = harness(language);
    let control = panel.render().find(element => element.type === 'Switch');
    assert.equal(control.props.checked, false);
    assert.equal(control.props.label, panel.t('subscription-settings.widget.serve-json-at-base-subscription'));
    assert.equal(control.props.description, panel.t('geofiles.json-setting-help'));
    control.props.onChange({ currentTarget: { checked: true } });
    assert.deepEqual(panel.requests, [{ variables: { uuid: 'settings-id', serveJsonAtBaseSubscription: true } }]);
    assert.equal(panel.render().find(element => element.type === 'Switch').props.checked, false);
    await panel.confirm({ ...panel.settings.data, serveJsonAtBaseSubscription: true });
    assert.deepEqual(panel.events, ['cancel', 'confirmed', 'invalidate']);
    control = panel.render().find(element => element.type === 'Switch');
    assert.equal(control.props.checked, true);
    control.props.onChange({ currentTarget: { checked: false } });
    assert.deepEqual(panel.requests[1], { variables: { uuid: 'settings-id', serveJsonAtBaseSubscription: false } });
    assert.equal(panel.settings.data.other, 'preserved');
    assert.deepEqual(panel.options().rQueryParams, { refetchOnMount: 'always', refetchOnWindowFocus: 'always' });
});

test('unknown initial state shows loading without a falsely disabled JSON setting', () => {
    const panel = harness('en', undefined);
    panel.settings.data = undefined;
    panel.settings.isSuccess = false;
    panel.settings.isPending = true;
    const view = panel.render();
    assert(!view.some(element => element.type === 'Switch'));
    assert(view.some(element => element.props.role === 'status'));
    assert.equal(panel.requests.length, 0);
});

test('read failure offers retry and prevents writes using stale settings', () => {
    const panel = harness();
    panel.settings.isSuccess = false;
    panel.settings.isError = true;
    const view = panel.render();
    assert(view.some(element => element.type === 'Alert' && element.props.role === 'alert'));
    const control = view.find(element => element.type === 'Switch');
    assert.equal(control.props.disabled, true);
    control.props.onChange({ currentTarget: { checked: true } });
    assert.equal(panel.requests.length, 0);
    view.find(element => element.type === 'Button').props.onClick();
    assert.deepEqual(panel.events, ['refetch']);
});

test('pending mutation cannot submit another change; rejection retains confirmed value', () => {
    const panel = harness();
    panel.update.isPending = true;
    const control = panel.render().find(element => element.type === 'Switch');
    assert.equal(control.props.disabled, true);
    control.props.onChange({ currentTarget: { checked: true } });
    assert.equal(panel.requests.length, 0);
    panel.update.isPending = false;
    panel.update.isError = true;
    const view = panel.render();
    assert.equal(view.find(element => element.type === 'Switch').props.checked, false);
    assert(view.some(element => element.props.role === 'alert' && element.props.children === panel.t('geofiles.json-setting-save-failed')));
    assert.equal(view.find(element => element.type === 'Switch').props.disabled, false);
});


test('both settings locations use one shared switch and saving other options cannot overwrite its confirmed value', () => {
    const requests = [];
    let initialValues;
    const sharedSwitch = () => null;
    const apiHooks = { QueryKeys: { subscriptionSettings: { getSubscriptionSettings: { queryKey: [] } } },
        useUpdateSubscriptionSettings: () => ({ mutate: value => requests.push(value), isPending: false }) };
    const mocks = {
        '@mantine/core': Object.fromEntries(['Button', 'Card', 'Group', 'Stack', 'Switch'].map(name => [name, name])),
        '@mantine/form': { schemaResolver: () => () => ({}), useForm: options => {
            initialValues = options.initialValues;
            return { onSubmit: callback => () => callback({ ...options.initialValues, serveJsonAtBaseSubscription: false }),
                key: value => value, getInputProps: () => ({}) };
        } },
        '@remnawave/backend-contract': { UpdateSubscriptionSettingsCommand: { RequestBodySchema: {} } },
        'react-i18next': { useTranslation: () => ({ t: value => value }) },
        'react-icons/pi': { PiGear: 'PiGear' },
        '@shared/api': { queryClient: { setQueryData() {} } },
        '@shared/api/hooks': apiHooks,
        '@shared/ui/settings-card': { SettingsCardShared: Object.fromEntries(['Container', 'Header', 'Content', 'Bottom'].map(name => [name, name])) },
        '@shared/ui/subscription-json-delivery': { SubscriptionJsonDelivery: sharedSwitch },
        '@shared/utils/misc': { handleFormErrors() {} }
    };
    function load(file) {
        const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
        const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
        const ref = { exports: {} };
        new Function('require', 'module', 'exports', compiled)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), ref, ref.exports);
        return ref.exports;
    }
    function elements(value) {
        if (Array.isArray(value)) return value.flatMap(elements);
        if (!value || typeof value !== 'object') return [];
        return [value, ...elements(value.props?.children)];
    }
    const main = load('widgets/dashboard/subscription-settings/settings/cards/subscription-additional-options.widget.tsx');
    const geo = load('widgets/dashboard/templates/subscription-template-editor/geofile-json-delivery.tsx');
    const view = main.SubscriptionAdditionalOptionsWidget({ subscriptionSettings: { uuid: 'settings-id', serveJsonAtBaseSubscription: true, randomizeHosts: true, isShowCustomRemarks: false } });
    assert.equal(Object.hasOwn(initialValues, 'serveJsonAtBaseSubscription'), false);
    assert.equal(elements(view).filter(element => element.type === sharedSwitch).length, 1);
    assert.equal(elements(geo.GeofileJsonDelivery()).filter(element => element.type === sharedSwitch).length, 1);
    view.props.onSubmit();
    assert.deepEqual(requests, [{ variables: { uuid: 'settings-id', randomizeHosts: true, isShowCustomRemarks: false } }]);
});

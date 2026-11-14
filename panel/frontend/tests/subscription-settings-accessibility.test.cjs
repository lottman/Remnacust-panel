const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MantineProvider } = require('@mantine/core');
const { MemoryRouter } = require('react-router');
const { createInstance } = require('i18next');
const { I18nextProvider } = require('react-i18next');
const { parseFragment } = require('parse5');
const ts = require('typescript');

const directory = path.join(__dirname, '../src/widgets/dashboard/subscription-settings/settings');
const element = React.createElement;
const container = ({ children }) => element('section', null, children);

function loadComponent(filename, mocks) {
    const source = fs.readFileSync(path.join(directory, filename), 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS }
    }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', compiled)(
        (name) => (Object.hasOwn(mocks, name) ? mocks[name] : require(name)),
        module,
        module.exports
    );
    return module.exports;
}

async function translations(language) {
    const dictionary = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../public/locales', language, 'remnawave.json'), 'utf8')
    );
    const i18n = createInstance();
    await i18n.init({ lng: language, resources: { [language]: { translation: dictionary } } });
    return i18n;
}

function render(component, i18n) {
    return renderToStaticMarkup(
        element(
            I18nextProvider,
            { i18n },
            element(MantineProvider, null, element(MemoryRouter, null, component))
        )
    );
}

function nodes(node) {
    return [node, ...(node.childNodes ?? []).flatMap(nodes)];
}

function attribute(node, name) {
    return node.attrs?.find((entry) => entry.name === name)?.value;
}

function textContent(node) {
    return node.nodeName === '#text'
        ? node.value
        : (node.childNodes ?? []).map(textContent).join('');
}

for (const language of ['ru', 'en', 'fa', 'zh']) {
    test(`${language}: rendered HWID switches reference their existing translated headings with unique ids`, async () => {
        const { SubscriptionHwidSettingsWidget } = loadComponent(
            'cards/subscription-hwid-settings.widget.tsx',
            {
                '@shared/api': { queryClient: { invalidateQueries() {} } },
                '@shared/api/hooks': { useUpdateSubscriptionSettings: () => ({ mutate() {}, isPending: false }) },
                '@shared/ui/flag-picker/flag-picker': { FlagTextarea: () => null },
                '@shared/ui/popovers': { TemplateInfoPopoverShared: () => null },
                '@shared/ui/settings-card': {
                    SettingsCardShared: { Container: container, Content: container, Bottom: container, Header: () => null }
                },
                '@shared/utils/misc': { handleFormErrors() {} }
            }
        );
        const i18n = await translations(language);
        const props = {
            subscriptionSettings: {
                uuid: '10000000-0000-4000-8000-000000000001',
                hwidSettings: { enabled: false, fallbackDeviceLimit: 3, maxDevicesAnnounce: null }
            }
        };
        const html = render(
            element(React.Fragment, null, element(SubscriptionHwidSettingsWidget, props), element(SubscriptionHwidSettingsWidget, props)),
            i18n
        );
        const tree = nodes(parseFragment(html));
        const switches = tree.filter((node) => attribute(node, 'role') === 'switch');
        assert.equal(switches.length, 2);
        const ids = switches.map((control) => attribute(control, 'aria-labelledby'));
        assert(ids.every(Boolean), 'HWID switches must reference visible heading elements');
        assert.equal(new Set(ids).size, 2);
        for (const [index, id] of ids.entries()) {
            const label = tree.filter((node) => attribute(node, 'id') === id);
            assert.equal(label.length, 1);
            assert.equal(textContent(label[0]), i18n.t('subscription-hwid-settings.widget.hwid-limit'));
            assert.equal(attribute(switches[index], 'aria-label'), undefined);
        }
    });
}

async function tabListHandler() {
    let rootProps;
    let listProps;
    const Tabs = ({ children, ...props }) => {
        rootProps = props;
        return element('div', null, children);
    };
    Tabs.List = ({ children, ...props }) => {
        listProps = props;
        return element('div', null, children);
    };
    Tabs.Tab = ({ children }) => element('button', null, children);
    Tabs.Panel = ({ children }) => element('div', null, children);
    const { SubscriptionSettingsTabsWidget } = loadComponent('subscription-tabs.widget.tsx', {
        '@mantine/core': { ...require('@mantine/core'), Tabs },
        'react-layout-masonry': { __esModule: true, default: container },
        './cards/subscription-additional-options.widget': { SubscriptionAdditionalOptionsWidget: () => null },
        './cards/subscription-hwid-settings.widget': { SubscriptionHwidSettingsWidget: () => null },
        './cards/subscription-response-headers-card.widget': { SubscriptionResponseHeadersCardWidget: () => null },
        './cards/subscription-user-remarks-card.widget': { SubscriptionUserRemarksCardWidget: () => null },
        './subscription-pages.widget': { SubscriptionPagesWidget: () => null }
    });
    render(element(SubscriptionSettingsTabsWidget, { subscriptionSettings: {} }), await translations('en'));
    assert.equal(rootProps.value, 'general');
    assert.equal(rootProps.keepMountedMode, 'display-none');
    assert.equal(typeof rootProps.onChange, 'function');
    assert.equal(typeof listProps.onFocus, 'function', 'The rendered tab list must reveal focused tabs');
    return listProps.onFocus;
}

function focusEvent(left, right, { role = 'tab', nested = false } = {}) {
    const calls = [];
    const list = {
        clientLeft: 0,
        clientWidth: 380,
        scrollLeft: 0,
        scrollTop: 37,
        getBoundingClientRect: () => ({ left: 16, right: 396 }),
        scrollBy(options) {
            calls.push(options);
            this.scrollLeft += options.left;
            this.scrollTop += options.top ?? 0;
        }
    };
    const tab = {
        getAttribute: (name) => (name === 'role' ? role : null),
        closest: () => (nested ? {} : list),
        getBoundingClientRect: () => ({ left: left - list.scrollLeft, right: right - list.scrollLeft })
    };
    return { event: { currentTarget: list, target: tab }, list, calls };
}

for (const [direction, left, right, delta] of [
    ['ltr', 324, 479, 83],
    ['rtl', -73, 95, -89]
]) {
    test(`${direction}: focusing a clipped tab scrolls only its list horizontally and stops once visible`, async () => {
        const onFocus = await tabListHandler();
        const { event, list, calls } = focusEvent(left, right);
        onFocus(event);
        assert.deepEqual(calls, [{ left: delta, behavior: 'instant' }]);
        assert.equal(list.scrollTop, 37);
        const rect = event.target.getBoundingClientRect();
        assert(rect.left >= 16 && rect.right <= 396);
        onFocus(event);
        assert.equal(calls.length, 1);
    });
}

test('visible tabs, unrelated focus and nested tab lists do not move the list', async () => {
    const onFocus = await tabListHandler();
    for (const [left, right, options] of [
        [154, 324, {}],
        [324, 479, { role: 'button' }],
        [324, 479, { nested: true }]
    ]) {
        const { event, calls } = focusEvent(left, right, options);
        onFocus(event);
        assert.deepEqual(calls, []);
    }
});

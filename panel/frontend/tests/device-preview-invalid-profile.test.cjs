const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MantineProvider } = require('@mantine/core');

for (const language of ['ru', 'en', 'fa', 'zh']) {
    test(`${language}: device preview exposes the invalid-profile reason without rendering host markup`, () => {
        const dictionary = require(`../public/locales/${language}/remnawave.json`);
        const translate = key => key.split('.').reduce((value, field) => value?.[field], dictionary) ?? key;
        const filename = path.join(__dirname, '../src/shared/_modals/users/user-hwid-devices-modal/device-subscription-preview.tsx');
        const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
        }).outputText;
        const module = { exports: {} };
        const mocks = {
            '@shared/api/axios': { instance: { post: () => { throw Error('Rendering must not send a request'); } } },
            'react-i18next': { useTranslation: () => ({ t: translate }) },
            '@tanstack/react-query': { useMutation: () => ({
                variables: { hwid: '', path: 'base', includeConfig: false },
                data: { allowed: true, reason: null, format: 'XRAY_JSON', hosts: [{
                    uuid: '10000000-0000-4000-8000-000000000001', remark: 'Broken <profile>',
                    templateUuid: null, included: false, reason: 'invalidConfiguration',
                    speedLimitMbps: null, deviceSpeedLimitMbps: null
                }] }
            }) }
        };
        new Function('require', 'module', 'exports', js)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), module, module.exports);
        const html = renderToStaticMarkup(React.createElement(MantineProvider, null,
            React.createElement(module.exports.DeviceSubscriptionPreviewContent, { userId: 1, devices: [] })));
        assert(html.includes(translate('operations.host_invalidConfiguration')));
        assert(!html.includes('operations.host_invalidConfiguration'));
        assert(html.includes('Broken &lt;profile&gt;'));
        assert(!html.includes('Broken <profile>'));
    });
}

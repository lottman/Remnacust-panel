const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MantineProvider } = require('@mantine/core');
const dayjs = require('dayjs');
dayjs.extend(require('dayjs/plugin/relativeTime'));
for (const language of ['ru', 'fa', 'zh']) require(`dayjs/locale/${language}`);
const load = require('../../backend/tests/load-typescript.cjs');
const durationPath = path.join(__dirname, '../src/shared/utils/time-utils/format-remaining-duration.util.ts');
const duration = load(durationPath);
const { getExpirationTextUtil } = load(path.join(__dirname, '../src/shared/utils/time-utils/get-expiration-text/get-expiration-text.util.ts'), {
    '../format-remaining-duration.util': duration
});
const now = Date.parse('2026-11-11T12:00:00Z');
const day = 86400000;

function loadComponent(filename, mocks) {
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    }).outputText;
    new Function('require', 'module', 'exports', code)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), module, module.exports);
    return module.exports;
}

for (const language of ['ru', 'en', 'fa', 'zh']) {
    const dictionary = require(`../public/locales/${language}/remnawave.json`);
    const t = (key, values = {}) => {
        const text = key.split('.').reduce((v, field) => v?.[field], dictionary) ?? key;
        return text.replace(/{{(\w+)}}/g, (_, field) => String(values[field]));
    };
    test(`${language}: remaining and expired subscriptions retain exact day counts beyond a month`, () => {
        const future = getExpirationTextUtil(new Date(now + 31 * day), t, { language }, now);
        assert.ok(future.includes(duration.formatRemainingDurationUtil(31 * day, language)));
        const past = getExpirationTextUtil(new Date(now - 31 * day), t, { language }, now);
        assert.ok(past.includes(new Intl.RelativeTimeFormat(language, { numeric: 'always' }).format(-31, 'day')));
        assert.equal(getExpirationTextUtil('bad date', t, { language }, now), t('get-expiration-text.util.unknown'));
        assert.equal(getExpirationTextUtil('2099-12-31T00:00:00Z', t, { language }, now), '∞');
    });
    test(`${language}: a frozen expiry keeps the date field disabled and blue`, () => {
        const Container = ({ children }) => React.createElement('div', null, children);
        const freezeSchedule = loadComponent(path.join(__dirname, '../src/shared/ui/forms/users/forms-components/freeze-schedule-field.tsx'), {
            'react-i18next': { useTranslation: () => ({ t, i18n: { language } }) }
        });
        const { AccessSettingsCard } = loadComponent(path.join(__dirname, '../src/shared/ui/forms/users/forms-components/access-settings-card.tsx'), {
            './user-expiration': load(path.join(__dirname, '../src/shared/ui/forms/users/forms-components/user-expiration.ts')),
            './freeze-schedule-field': freezeSchedule,
            '@widgets/dashboard/users/internal-squads-list': { InternalSquadsListWidget: () => null },
            '@shared/api/axios': { instance: { get() { throw Error('render must not request domains'); } } },
            '@shared/api/hooks/subscription-domains': load(path.join(__dirname, '../src/shared/api/hooks/subscription-domains.ts'), {
                '@shared/api/axios': { instance: { get() { throw Error('render must not request domains'); } } }
            }),
            '@shared/i18n/interface-text': { useUiText: () => key => key },
            '@shared/ui/overlays/base-overlay-header': { BaseOverlayHeader: () => null },
            '@shared/ui/section-card': { SectionCard: { Root: Container, Section: Container } },
            '@tanstack/react-query': { useQuery: () => ({ data: [] }) },
            'react-i18next': { useTranslation: () => ({ t, i18n: { language } }) }
        });
        const expiry = new Date('2026-12-12T12:34:00Z');
        const form = { values: { expireAt: expiry, status: 'FROZEN' }, errors: {}, getValues: () => form.values, watch() {}, getInputProps: () => ({}), key: value => value };
        const html = renderToStaticMarkup(React.createElement(MantineProvider, null,
            React.createElement(AccessSettingsCard, { cardVariants: {}, motionWrapper: Container, form, isFrozen: true, frozenRemainingMs: 31 * day })));
        assert.match(html, /disabled/);
        assert.match(html, /color:var\(--mantine-color-blue-5\)/);
        assert.match(html, /2026/);
        assert.doesNotMatch(html, /frozen-user\.|create-user-modal\./);
        assert.equal(form.values.expireAt, expiry);
    });
}

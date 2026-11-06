const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const mantine = require('@mantine/core')
const { useForm } = require('@mantine/form')

const proxyUrl = 'socks5://fixture:synthetic-only@proxy.example.test:1080'
const source = fs.readFileSync(
    path.join(__dirname, '../src/shared/ui/forms/nodes/base-node-form/node-vitals.card.tsx'),
    'utf8'
)

function renderVitals(language, initialProxyUrl = proxyUrl) {
    const locale = require(`../public/locales/${language}/remnawave.json`)
    const translate = key => key.split('.').reduce((value, part) => value?.[part], locale) ?? key
    const exports = {}
    let form
    let input
    const section = ({ children }) => React.createElement('section', null, children)
    vm.runInNewContext(ts.transpileModule(source, {
        compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.CommonJS,
            esModuleInterop: true
        }
    }).outputText, {
        exports,
        require(name) {
            if (name === '@mantine/core') return {
                ...mantine,
                PasswordInput: props => {
                    input = props
                    return React.createElement(mantine.PasswordInput, props)
                }
            }
            if (name === 'react-i18next') return {
                useTranslation: () => ({ t: translate, i18n: { language } })
            }
            if (name === '@shared/i18n/interface-text') return { useUiText: () => translate }
            if (name === '@shared/ui/copyable-field/copyable-field') return {
                CopyableFieldShared: () => null
            }
            if (name === '@shared/ui/flag-picker/flag-picker') return {
                FlagTextInput: mantine.TextInput
            }
            if (name === '@shared/ui/overlays/base-overlay-header') return {
                BaseOverlayHeader: () => null
            }
            if (name === '@shared/ui/section-card') return {
                SectionCard: { Root: section, Section: section }
            }
            if (name === '@shared/ui/tag-input-pill') return { TagInputPill: () => null }
            if (name === './constants') return { getLocalizedCountries: () => [] }
            if (name.endsWith('.module.css')) return { default: {} }
            return require(name)
        }
    })
    function Harness() {
        form = useForm({
            mode: 'uncontrolled',
            initialValues: {
                name: 'Fixture node', countryCode: '', address: '192.0.2.10', port: 2222,
                proxyUrl: initialProxyUrl, activePluginUuid: null, integrationUuids: []
            }
        })
        return React.createElement(exports.NodeVitalsCard, {
            form, cardVariants: {}, motionWrapper: section, nodeUuid: 'fixture',
            nodeIntegrations: [], nodePlugins: [], secretKey: undefined
        })
    }
    const html = renderToStaticMarkup(React.createElement(mantine.MantineProvider, null,
        React.createElement(Harness)
    ))
    return { html, form, input, translate }
}

for (const language of ['ru', 'en', 'fa', 'zh']) {
    test(`${language}: the real node proxy field masks its value and offers a keyboard reveal button`, () => {
        const { html, input, translate } = renderVitals(language)
        const field = html.match(/<input\b[^>]*type="password"[^>]*>/)?.[0]
        assert.ok(field, 'Proxy URL must render as a password input by default')
        assert.ok(field.includes(`value="${proxyUrl}"`))
        assert.ok(!field.includes('readonly') && !field.includes('disabled'))
        assert.ok(input.visibilityToggleFocusable)
        assert.equal(input.visibilityToggleButtonProps['aria-label'], translate('design-ui.toggle-password'))
        assert.ok(html.includes(`aria-label="${translate('design-ui.toggle-password')}"`))
        assert.equal(input.visible, undefined)
        assert.equal(input.defaultVisible, undefined)
        assert.ok(!html.match(/<input\b[^>]*type="text"[^>]*value="socks5:/))
    })
}

test('masking preserves the real uncontrolled form handlers for changing and clearing a proxy', () => {
    const { input, form } = renderVitals('en')
    const replacement = 'socks5://new-user:new-secret@proxy.example.test:1081'
    input.onChange(replacement)
    assert.equal(form.getValues().proxyUrl, replacement)
    input.onChange('')
    assert.equal(form.getValues().proxyUrl, '')
})

test('an empty proxy remains an editable masked field for configuring a direct node later', () => {
    const { html, input, form } = renderVitals('en', '')
    assert.match(html, /<input\b[^>]*type="password"[^>]*value=""/)
    input.onChange(proxyUrl)
    assert.equal(form.getValues().proxyUrl, proxyUrl)
})

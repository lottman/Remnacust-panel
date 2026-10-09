const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const mantine = require('@mantine/core')

function renderActions({ dirty = false, pending = false, valid = true, value = '{"inbounds":[],"outbounds":[]}' } = {}) {
    const mutations = []
    const confirmations = []
    const notices = []
    let saveButton
    const exports = {}
    const filename = path.join(__dirname, '../src/features/dashboard/config-profiles/config-editor-actions/config-editor-actions.feature.tsx')
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
    }).outputText, { exports, require(name) {
        if (name === '@mantine/core') return { ...mantine, Button: props => {
            if (props.children === 'common.action.save') saveButton = props
            return React.createElement(mantine.Button, props)
        } }
        if (name === 'react-i18next') return { useTranslation: () => ({ t: key => key }) }
        if (name === '@mantine/modals') return { modals: { openConfirmModal: options => confirmations.push(options) } }
        if (name === '@mantine/notifications') return { notifications: { show: notice => notices.push(notice) } }
        if (name === '@shared/api') return { queryClient: {} }
        if (name === '@shared/api/hooks') return {
            QueryKeys: {}, useUpdateConfigProfile: () => ({ mutate: payload => mutations.push(payload), isPending: pending })
        }
        if (name === '@shared/hooks') return { useIsMobile: () => false }
        if (name === '@shared/ui/load-templates/use-download-template') return { useDownloadTemplate: () => ({ openDownloadModal() {} }) }
        if (name.startsWith('@widgets/') || name.startsWith('@shared/ui/')) return {}
        if (name === 'consola/browser') return { error() {} }
        if (name.endsWith('.module.css')) return { default: {} }
        return require(name)
    } })
    const html = renderToStaticMarkup(React.createElement(mantine.MantineProvider, null,
        React.createElement(exports.ConfigEditorActionsFeature, {
            editorRef: { current: { getValue: () => value } },
            configProfile: { uuid: 'selected-profile', config: {} },
            isConfigValid: valid, validationMessage: 'Invalid runtime configuration',
            hasUnsavedChanges: dirty, setResult() {}, setIsConfigValid() {},
            setHasUnsavedChanges() {}, setOriginalValue() {}
        })
    ))
    return { html, saveButton, mutations, confirmations, notices }
}

for (const dirty of [false, true]) {
    test(`saving a valid profile submits the current JSON even when dirty=${dirty}`, () => {
        const result = renderActions({ dirty })
        assert.equal(result.saveButton.color, 'teal')
        assert.equal(result.saveButton.disabled, false)
        result.saveButton.onClick()
        assert.deepEqual(JSON.parse(JSON.stringify(result.mutations)), [{ variables: {
            uuid: 'selected-profile', config: { inbounds: [], outbounds: [] }
        } }])
        assert.equal(result.confirmations.length, 0)
    })
}

test('saving stays disabled while the previous update is pending', () => {
    const { html, saveButton } = renderActions({ pending: true })
    assert.equal(saveButton.disabled, true)
    assert.equal(saveButton.loading, true)
    assert.match(html, /disabled/)
})

test('unchanged invalid runtime config still requires confirmation', () => {
    const result = renderActions({ valid: false })
    result.saveButton.onClick()
    assert.equal(result.mutations.length, 0)
    assert.equal(result.confirmations.length, 1)
    result.confirmations[0].onConfirm()
    assert.equal(result.mutations.length, 1)
})

test('malformed JSON is never submitted even after confirming the validation warning', () => {
    const result = renderActions({ valid: false, value: '{broken' })
    result.saveButton.onClick()
    result.confirmations[0].onConfirm()
    assert.equal(result.mutations.length, 0)
    assert.equal(result.notices.length, 1)
    assert.equal(result.notices[0].color, 'red')
})

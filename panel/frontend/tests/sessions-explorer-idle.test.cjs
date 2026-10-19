const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { MantineProvider } = require('@mantine/core')
const locale = require('../public/locales/ru/remnawave.json')
const t = (key, values = {}) => {
    let text = key.split('.').reduce((value, part) => value[part], locale)
    for (const [name, value] of Object.entries(values)) text = text.replaceAll('{{' + name + '}}', value)
    return text
}
const exportsRef = {}
const pass = ({ children }) => React.createElement('div', null, children)
const mocks = {
    'react-i18next': { useTranslation: () => ({ t }) },
    '@shared/ui/overlays/base-overlay-header': { BaseOverlayHeader: ({ title }) => React.createElement('h2', null, title) },
    '@shared/ui/refresh-control': { RefreshButton: require('@mantine/core').Button },
    '@shared/ui/section-card': { SectionCard: { Root: pass, Section: pass } }
}
const file = path.join(__dirname, '../src/widgets/dashboard/sessions-explorer/sessions-explorer-widget/sessions-explorer-idle.tsx')
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true
} }).outputText, { exports: exportsRef, require: name => mocks[name] ?? require(name) })
function render(props) {
    return renderToStaticMarkup(React.createElement(MantineProvider, null,
        React.createElement(exportsRef.SessionsExplorerIdle, { onlineNodesCount: 0, totalNodesCount: 0,
            isLoading: false, isError: false, onStart() {}, ...props })))
}
test('scan screen explains loading, failure, empty list and disconnected states separately', () => {
    for (const [props, message] of [
        [{ isLoading: true }, 'Загружаем список нод'],
        [{ isError: true, totalNodesCount: 3 }, 'Это не означает, что ноды отключены'],
        [{}, 'Панель вернула пустой список нод'],
        [{ totalNodesCount: 3 }, 'Нод в списке: 3. Ни одна не отмечена']
    ]) {
        const html = render(props)
        assert.ok(html.includes(message), message)
        if (props.isLoading) assert.match(html, /<button[^>]*disabled/)
        else assert.doesNotMatch(html, /<button[^>]*disabled/)
        assert.ok(!html.includes('Обновить ноды'))
        assert.equal((html.match(/<button/g) ?? []).length, 1)
    }
})
test('available nodes enable scan and NET_ADMIN is explicitly optional for observation', () => {
    const html = render({ totalNodesCount: 3, onlineNodesCount: 2 })
    assert.ok(html.includes('Для обхода доступно нод: 2 из 3'))
    assert.doesNotMatch(html, /<button[^>]*disabled/)
    assert.ok(html.includes('Для просмотра сессий NET_ADMIN не нужен'))
    assert.ok(!html.includes('cap_add'))
})

test('scan uses the freshly loaded nodes rather than the previous render', async () => {
    const called = []
    const hookExports = {}
    const hookFile = path.join(path.dirname(file), 'use-sessions-explorer.ts')
    const hookMocks = {
        react: {
            useState: value => [value, () => {}],
            useRef: value => ({ current: value }),
            useEffect: () => {}
        },
        '@shared/api': { instance: {} },
        '@shared/api/hooks': {
            useConnectionsByNode: () => ({ mutateAsync: async ({ route }) => {
                called.push(route.nodeUuid)
                return { jobId: route.nodeUuid }
            } }),
            useConnectionsByNodeResultMutation: () => ({ mutateAsync: async () => ({
                isCompleted: true, result: { success: true, users: [] }
            }) })
        }
    }
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(hookFile, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText, {
        exports: hookExports, require: name => hookMocks[name] ?? require(name),
        AbortController, DOMException, setTimeout: fn => setTimeout(fn, 0), clearTimeout
    })
    const stale = { uuid: 'stale', isConnected: true, isDisabled: false }
    const hook = hookExports.useSessionsExplorer([stale])
    await hook.start([
        { ...stale, uuid: 'fresh' },
        { ...stale, uuid: 'disabled', isDisabled: true },
        { ...stale, uuid: 'offline', isConnected: false }
    ])
    assert.deepEqual(called, ['fresh'])
    await hook.start([])
    assert.deepEqual(called, ['fresh'])
})

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

function harness(overrides = {}) {
    const state = []
    const diffRef = { current: null }
    let cleanup
    let cursor = 0
    const exports = {}
    const source = fs.readFileSync(path.join(__dirname, '../src/shared/ui/revision-history/revision-history.tsx'), 'utf8')
    vm.runInNewContext(ts.transpileModule(source, {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS }
    }).outputText, { exports, queueMicrotask, require(name) {
        if (name === 'react') return { useRef: () => diffRef, useLayoutEffect: effect => { cleanup = effect() }, useState(initial) {
            const index = cursor++
            if (!(index in state)) state[index] = initial
            return [state[index], value => { state[index] = value }]
        } }
        if (name === '@mantine/core') return { ...Object.fromEntries(['Alert', 'Badge', 'Button', 'Group', 'Card', 'Select', 'Stack', 'Text'].map(key => [key, key])), useMantineColorScheme: () => ({ colorScheme: 'dark' }) }
        if (name === 'react-i18next') return { useTranslation: () => ({ t: key => key, i18n: { language: 'en' } }) }
        if (name === '@monaco-editor/react') return { DiffEditor: 'diff' }
        if (name.endsWith('.css')) return { default: {} }
        if (name.includes('diffEditor/register')) return {}
        return require(name)
    } })
    const restored = []
    const props = { revisions: [{ uuid: 'one', name: 'First', createdAt: '2026-10-17', code: 'saved' }, { uuid: 'two', name: 'Second', createdAt: '2026-10-16', code: 'older' }], language: 'json', draft: 'dirty', baseline: 'baseline', help: 'help', isPending: false, isError: false, isFetching: false, onRefresh() {}, onRestore: revision => restored.push(revision), ...overrides }
    function render() { cursor = 0; return exports.RevisionHistory(props) }
    function elements(element) {
        if (Array.isArray(element)) return element.flatMap(elements)
        if (!element || typeof element !== 'object') return []
        return [element, ...elements(element.props?.children)]
    }
    function find(type, text) { return elements(render()).find(el => el.type === type && (text === undefined || el.props.children === text)) }
    function click(key) { const button = find('Button', 'template-history.' + key); assert.ok(button, key); button.props.onClick() }
    return { props, restored, find, click, cleanup: () => cleanup() }
}

test('history confirms dirty draft replacement; cancellation preserves the draft', () => {
    const h = harness()
    h.click('restore')
    assert.equal(h.restored.length, 0)
    h.click('cancel')
    assert.equal(h.restored.length, 0)
    h.click('restore')
    h.click('replace')
    assert.equal(h.restored[0].code, 'saved')
})

test('confirmation expires when saved code, selection, or draft changes', () => {
    for (const mutate of [
        h => { h.props.revisions[0].code = 'refetched' },
        h => { h.props.draft = 'new edits' },
        h => h.find('Select').props.onChange('two')
    ]) {
        const h = harness()
        h.click('restore')
        mutate(h)
        assert.equal(h.find('Button', 'template-history.replace'), undefined)
        h.click('restore')
        assert.equal(h.restored.length, 0)
        h.click('replace')
        assert.equal(h.restored.length, 1)
    }
})

test('clean draft restores selected version directly and diff compares saved code to draft', () => {
    const h = harness({ draft: 'baseline' })
    h.find('Select').props.onChange('two')
    assert.equal(h.find('diff').props.original, 'older')
    assert.equal(h.find('diff').props.modified, 'baseline')
    h.click('restore')
    assert.equal(h.restored[0].uuid, 'two')
})

test('failed, pending and empty history cannot restore any revision', () => {
    for (const props of [{ isPending: true }, { isError: true }, { revisions: [] }]) {
        const h = harness(props)
        assert.equal(h.find('Button', 'template-history.restore'), undefined)
        assert.equal(h.find('diff'), undefined)
    }
    let retries = 0
    const h = harness({ isError: true, onRefresh: () => retries++ })
    h.click('retry')
    assert.equal(retries, 1)
})

test('closing history detaches the diff before releasing both models', () => {
    const h = harness()
    const props = h.find('diff').props
    assert.equal(props.keepCurrentOriginalModel, true)
    assert.equal(props.keepCurrentModifiedModel, true)
    const disposed = []
    props.onMount({
        getModel: () => ({
            original: { dispose: () => disposed.push('original') },
            modified: { dispose: () => disposed.push('modified') }
        }),
        setModel: value => { assert.equal(value, null); disposed.push('detached') }
    })
    assert.deepEqual(disposed, [])
    h.cleanup()
    assert.deepEqual(disposed, ['detached', 'original', 'modified'])
    h.cleanup()
    assert.deepEqual(disposed, ['detached', 'original', 'modified'], 'Cleanup is idempotent')
})

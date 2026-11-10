const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function harness() {
    const dispatcher = new EventTarget()
    const operations = []
    const cleanups = []
    let opened = 0
    const view = {
        addEventListener(type, listener, options) {
            operations.push(['add', type, options.capture])
            dispatcher.addEventListener(type, listener, options)
        },
        removeEventListener(type, listener, options) {
            operations.push(['remove', type, options.capture])
            dispatcher.removeEventListener(type, listener, options)
        }
    }
    class Element {
        constructor(editor = false) { this.editor = editor }
        closest(selector) { return selector === '.monaco-editor' && this.editor ? this : null }
    }
    const filename = path.join(__dirname, '../src/shared/hooks/use-page-search-shortcut.ts')
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
    const ref = { exports: {} }
    new Function('require', 'module', 'exports', 'Element', 'window', js)(name => {
        if (name === 'react') return { useEffect: callback => cleanups.push(callback()) }
        if (name === '@mantine/spotlight') return { spotlight: { open: () => opened++ } }
        throw new Error('Unexpected dependency')
    }, ref, ref.exports, Element, view)
    function send(values, target) {
        const event = new Event('keydown', { cancelable: true })
        Object.assign(event, { key: '', code: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, isComposing: false, repeat: false, ...values })
        if (target) Object.defineProperty(event, 'target', { value: target })
        dispatcher.dispatchEvent(event)
        return event
    }
    return { ...ref.exports, view, send, Element, operations, cleanups, count: () => opened }
}

test('page find captures Ctrl+F, Cmd+F and F3 even from a focused form field', () => {
    const h = harness()
    h.usePageSearchShortcut()
    for (const keys of [
        { key: 'f', code: 'KeyF', ctrlKey: true },
        { key: 'f', code: 'KeyF', metaKey: true },
        { key: 'а', code: 'KeyF', ctrlKey: true },
        { key: 'F3' },
        { key: 'F3', shiftKey: true }
    ]) assert.equal(h.send(keys, new h.Element()).defaultPrevented, true)
    assert.equal(h.count(), 5)
    assert.deepEqual(h.operations, [['add', 'keydown', true]])
    h.cleanups[0]()
})

test('repeated find keys still suppress browser find without reopening the page search', () => {
    const h = harness()
    h.usePageSearchShortcut()
    assert.equal(h.send({ key: 'F3', repeat: true }).defaultPrevented, true)
    assert.equal(h.count(), 0)
    h.cleanups[0]()
})

test('editor find, composition and unrelated shortcuts remain local to their owner', () => {
    const h = harness()
    h.usePageSearchShortcut()
    assert.equal(h.send({ key: 'f', ctrlKey: true }, new h.Element(true)).defaultPrevented, false)
    for (const keys of [
        { key: 'f', ctrlKey: true, isComposing: true },
        { key: 'f', ctrlKey: true, altKey: true },
        { key: 'f', ctrlKey: true, shiftKey: true },
        { key: 'g', ctrlKey: true },
        { key: 'Escape' },
        { key: 'f' }
    ]) assert.equal(h.send(keys).defaultPrevented, false)
    assert.equal(h.count(), 0)
    h.cleanups[0]()
})

test('leaving the page removes the capturing handler and restores ordinary browser keys', () => {
    const h = harness()
    h.usePageSearchShortcut()
    h.cleanups[0]()
    assert.equal(h.send({ key: 'F3' }).defaultPrevented, false)
    assert.equal(h.count(), 0)
    assert.deepEqual(h.operations, [['add', 'keydown', true], ['remove', 'keydown', true]])
})

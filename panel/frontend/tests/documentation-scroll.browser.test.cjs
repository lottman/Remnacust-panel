const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { spawn } = require('node:child_process')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const fixture = path.join(root, 'tests/fixtures/documentation-scroll')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const index = '[data-documentation-mode] > nav'

test('documentation scroll input remains inside its intended pane in real Chrome', {
    skip: process.env.DOCUMENTATION_SCROLL_BROWSER !== '1', timeout: 180000
}, async t => {
    const url = new URL(process.env.DOCUMENTATION_SCROLL_URL ?? 'http://127.0.0.1:4351/')
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    try { await fetch(url, { signal: AbortSignal.timeout(1500) }) }
    catch {
        const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'),
            '--config', 'tests/fixtures/documentation-scroll/vite.config.ts',
            '--configLoader', 'runner', '--port', url.port || '4351'
        ], { cwd: root, stdio: 'ignore', windowsHide: true })
        t.after(() => server.kill())
        let ready = false
        for (let attempt = 0; attempt < 150; attempt++) {
            try { ready = (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok } catch {}
            if (ready) break
            await pause(100)
        }
        assert.ok(ready, 'Documentation fixture did not start')
    }
    const harness = new Module(path.join(fixture, 'browser.cjs'), module)
    harness.filename = path.join(fixture, 'browser.cjs')
    harness.paths = module.paths
    harness._compile(fs.readFileSync(path.join(root, 'tests/fixtures/node-wizard/cdp.cjs'), 'utf8'), harness.filename)
    const browser = await harness.exports.launchBrowser()
    t.after(() => browser.close())
    const evaluate = expression => browser.evaluate(expression)
    const snapshot = () => evaluate('documentationFixture.snapshot()')
    const key = async (value, virtual, shift = false) => {
        const parameters = { key: value, code: value === ' ' ? 'Space' : value,
            windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual, modifiers: shift ? 8 : 0 }
        await browser.send('Input.dispatchKeyEvent', { ...parameters, type: 'keyDown' })
        await browser.send('Input.dispatchKeyEvent', { ...parameters, type: 'keyUp' })
    }
    async function open(width, language, mode = 'guide') {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 })
        await browser.send('Emulation.setTouchEmulationEnabled', { enabled: width === 390 })
        await browser.send('Emulation.setEmulatedMedia', { features: [
            { name: 'prefers-reduced-motion', value: width === 390 ? 'reduce' : 'no-preference' }
        ] })
        const target = new URL(url)
        target.searchParams.set('lang', language)
        target.searchParams.set('mode', mode)
        await browser.send('Page.navigate', { url: target.href })
        await browser.waitFor('!!document.querySelector(' + JSON.stringify(index) + ')', 30000)
        await pause(200)
        await evaluate('documentationFixture.clearEvents()')
    }
    async function reset(body, bottom = false) {
        await evaluate('(() => { const navigation = document.querySelector(' + JSON.stringify(index) + '); window.scrollTo(0,' + body + '); navigation.scrollTop=' + (bottom ? 'navigation.scrollHeight' : '0') + '; })()')
        await pause(100)
        if (bottom) await evaluate('document.querySelector(' + JSON.stringify(index) + ').scrollTop=99999')
        await evaluate('documentationFixture.clearEvents()')
    }
    async function point(selector) {
        return evaluate('(() => { const rect=document.querySelector(' + JSON.stringify(selector) + ').getBoundingClientRect(); return {x:rect.left+rect.width/2,y:Math.min(innerHeight-40,Math.max(90,rect.top)+Math.min(70,rect.height/2))}; })()')
    }
    async function wheel(selector, delta) {
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...await point(selector), deltaX: 0, deltaY: delta })
        await pause(300)
    }
    async function touch(selector, delta) {
        const position = await evaluate('(() => { const rect=document.querySelector(' + JSON.stringify(selector) + ').getBoundingClientRect(); return {x:rect.left+rect.width/2,y:(Math.max(80,rect.top)+Math.min(innerHeight-20,rect.bottom))/2}; })()')
        await browser.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [position] })
        for (let step = 1; step <= 8; step++) {
            await browser.send('Input.dispatchTouchEvent', { type: 'touchMove',
                touchPoints: [{ x: position.x, y: position.y - delta * step / 8 }] })
            await pause(20)
        }
        await browser.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        await pause(300)
    }
    const run = async (name, width, language, callback) => {
        if (process.env.DOCUMENTATION_SCROLL_CASE && !name.startsWith(process.env.DOCUMENTATION_SCROLL_CASE)) return
        if (process.env.DOCUMENTATION_SCROLL_WIDTH && Number(process.env.DOCUMENTATION_SCROLL_WIDTH) !== width) return
        if (process.env.DOCUMENTATION_SCROLL_LANGUAGE && process.env.DOCUMENTATION_SCROLL_LANGUAGE !== language) return
        await t.test(name + ' (' + width + ', ' + language + ')', callback)
    }
    for (const width of [1280, 390]) {
        for (const language of ['en', 'fa']) {
            await run('keyboard focus scrolls only the documentation index', width, language, async () => {
                await open(width, language)
                const count = await evaluate('document.querySelectorAll(' + JSON.stringify(index + ' a') + ').length')
                await evaluate('document.querySelector(' + JSON.stringify(index + ' a') + ').focus()')
                for (let step = 1; step < count; step++) {
                    await key('Tab', 9)
                    await pause(12)
                    assert.equal((await snapshot()).body, 0, 'Tab focus in the index must not move the article/body')
                }
                const last = await snapshot()
                assert.ok(last.index > 0, 'Keyboard focus must reveal the lower index links')
                assert.ok(last.indexBounds.bottom <= 900, 'Focused index must fit inside the viewport')
                await key('PageDown', 34)
                await key('ArrowDown', 40)
                await key(' ', 32)
                await key('End', 35)
                await pause(200)
                assert.equal((await snapshot()).body, 0, 'Scrolling keys at the lower edge must stay inside the index')
            })
            await run('wheel index boundaries retain the article position', width, language, async () => {
                await open(width, language)
                await reset(0)
                await wheel(index, 300)
                let state = await snapshot()
                assert.ok(state.index > 0)
                assert.equal(state.body, 0)
                assert.ok(state.events.some(event => event.type === 'wheel' && event.trusted))
                await reset(0, true)
                await wheel(index, 500)
                assert.equal((await snapshot()).body, 0)
                await reset(350)
                await wheel(index, -500)
                assert.equal((await snapshot()).body, 350)
            })
            await run('article wheel and explicit links retain their usual navigation', width, language, async () => {
                await open(width, language)
                await reset(0)
                await wheel('[data-documentation-mode] article', 400)
                assert.ok((await snapshot()).body > 0, 'Article wheel must still scroll the document')
                await reset(350)
                await evaluate('document.querySelector(' + JSON.stringify(index + ' a') + ').click()')
                await browser.waitFor('documentationFixture.router.state.location.search.includes("article=installation-files")')
                await browser.waitFor('scrollY === 0')
                await browser.waitFor('!!document.querySelector("[data-documentation-mode] article nav a")')
                await evaluate('document.querySelector("[data-documentation-mode] article nav a").click()')
                await browser.waitFor('!!documentationFixture.router.state.location.hash && scrollY > 0')
                assert.ok((await snapshot()).location.search.includes('language=' + language))
                assert.ok((await snapshot()).scrollWidth <= width)
            })
            await run('API index keeps its own wheel and keyboard scroll', width, language, async () => {
                await open(width, language, 'api')
                await reset(0, true)
                await wheel(index, 500)
                assert.equal((await snapshot()).body, 0)
                await evaluate('[...document.querySelectorAll(' + JSON.stringify(index + ' a') + ')].at(-2).focus({preventScroll:true})')
                await key('Tab', 9)
                await pause(100)
                assert.equal((await snapshot()).body, 0)
                assert.ok((await snapshot()).indexBounds.bottom <= 900)
            })
            await run('empty filtered index does not hand its wheel to the body', width, language, async () => {
                await open(width, language)
                await evaluate('document.querySelector("[data-panel-page] .mantine-TextInput-input").focus()')
                await browser.send('Input.insertText', { text: '000-no-matches-fixture-000' })
                await browser.waitFor('document.querySelectorAll(' + JSON.stringify(index + ' a') + ').length === 0')
                await wheel(index, 500)
                assert.equal((await snapshot()).body, 0)
            })
        }
    }
    await run('viewport resize preserves a bounded keyboard scroll pane', 1280, 'en', async () => {
        await open(1280, 'en')
        await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 620, deviceScaleFactor: 1, mobile: false })
        await browser.waitFor('documentationFixture.snapshot().indexBounds.bottom <= 620')
        await evaluate('document.querySelector(' + JSON.stringify(index) + ').focus()')
        await key('PageDown', 34)
        await pause(200)
        assert.equal((await snapshot()).body, 0)
        assert.ok((await snapshot()).index > 0)
    })
    for (const language of ['en', 'fa']) {
        await run('touch index edges do not chain into the article', 390, language, async () => {
            await open(390, language)
            await reset(0)
            await touch(index, 100)
            assert.ok((await snapshot()).index > 0)
            assert.equal((await snapshot()).body, 0)
            assert.ok((await snapshot()).events.some(event => event.type === 'touchmove' && event.trusted))
            await reset(0, true)
            await touch(index, 100)
            assert.equal((await snapshot()).body, 0)
            await reset(350)
            await touch(index, -100)
            assert.equal((await snapshot()).body, 350)
        })
        await run('main sidebar wheel edge does not scroll the documentation body', 1280, language, async () => {
            await open(1280, language)
            await reset(0)
            const viewport = '#panel-navigation .mantine-ScrollArea-viewport'
            await wheel(viewport, 300)
            assert.ok(await evaluate('document.querySelector(' + JSON.stringify(viewport) + ').scrollTop > 0'))
            assert.equal((await snapshot()).body, 0)
            await evaluate('document.querySelector(' + JSON.stringify(viewport) + ').scrollTop=99999')
            await wheel(viewport, 500)
            assert.equal((await snapshot()).body, 0)
            await evaluate('[...document.querySelectorAll(' + JSON.stringify(viewport + ' a') + ')].at(-1).focus()')
            await key('PageDown', 34)
            await key('End', 35)
            await pause(150)
            assert.equal((await snapshot()).body, 0)
            await reset(350)
            await evaluate('document.querySelector(' + JSON.stringify(viewport) + ').scrollTop=0')
            await wheel(viewport, -500)
            assert.equal((await snapshot()).body, 350)
        })
        await run('collapsed desktop sidebar leaves body wheel and keyboard available', 1280, language, async () => {
            await open(1280, language)
            await reset(0)
            await evaluate('document.querySelector("button[aria-controls=panel-navigation]").click()')
            await browser.waitFor('document.getElementById("panel-navigation").inert && getComputedStyle(document.getElementById("panel-navigation")).visibility === "hidden"')
            const position = { x: language === 'fa' ? 1160 : 120, y: 140 }
            assert.equal(await evaluate('!!document.elementFromPoint(' + position.x + ',' + position.y + ')?.closest("#panel-navigation")'), false)
            await browser.send('Input.dispatchMouseEvent', { type: 'mouseWheel',
                ...position, deltaX: 0, deltaY: 300 })
            await pause(300)
            const afterWheel = (await snapshot()).body
            assert.ok(afterWheel > 0)
            await evaluate('document.getElementById("panel-main").focus({preventScroll:true})')
            await key('PageDown', 34)
            await pause(300)
            assert.ok((await snapshot()).body > afterWheel)
        })
        await run('mobile main sidebar touch does not trap the article after closing', 390, language, async () => {
            await open(390, language)
            await reset(350)
            await evaluate('document.querySelector("button[aria-controls=panel-navigation]").click()')
            await browser.waitFor('document.body.style.overflow === "hidden"')
            const viewport = '#panel-navigation .mantine-ScrollArea-viewport'
            await touch(viewport, 100)
            assert.ok(await evaluate('document.querySelector(' + JSON.stringify(viewport) + ').scrollTop > 0'))
            assert.equal((await snapshot()).body, 350)
            await evaluate('document.querySelector(' + JSON.stringify(viewport) + ').scrollTop=99999')
            await touch(viewport, 100)
            assert.equal((await snapshot()).body, 350)
            await key('Escape', 27)
            await browser.waitFor('document.body.style.overflow !== "hidden"')
            await wheel('[data-documentation-mode] article', 250)
            assert.ok((await snapshot()).body > 350)
        })
    }
    assert.deepEqual(browser.consoleErrors, [])
})

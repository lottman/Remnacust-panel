const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { spawn } = require('node:child_process')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const fixture = path.join(root, 'tests/fixtures/language-flicker')
const labels = { en: 'English', ru: 'Русский', fa: 'فارسی', zh: '简体中文' }
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

test('production language picker retains the AppShell during cold locale changes', {
    skip: process.env.LANGUAGE_PICKER_BROWSER !== '1',
    timeout: 180000
}, async t => {
    const url = new URL(process.env.LANGUAGE_PICKER_URL ?? 'http://127.0.0.1:4350/')
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    let server
    try { await fetch(url, { signal: AbortSignal.timeout(1500) }) }
    catch {
        server = spawn(process.execPath, [
            path.join(root, 'node_modules/vite/bin/vite.js'),
            '--config', 'tests/fixtures/language-flicker/vite.config.ts',
            '--configLoader', 'runner', '--port', url.port || '4350'
        ], { cwd: root, stdio: 'ignore', windowsHide: true })
        t.after(() => server.kill())
        for (let attempt = 0; attempt < 150; attempt++) {
            try { if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) break } catch {}
            await pause(100)
        }
    }
    const harness = new Module(path.join(fixture, 'browser.cjs'), module)
    harness.filename = path.join(fixture, 'browser.cjs')
    harness.paths = module.paths
    harness._compile(fs.readFileSync(path.join(root, 'tests/fixtures/node-wizard/cdp.cjs'), 'utf8'), harness.filename)
    const browser = await harness.exports.launchBrowser()
    t.after(() => browser.close())
    const evaluate = expression => browser.evaluate(expression)
    const key = async value => {
        const virtual = { Enter: 13, Escape: 27, ArrowDown: 40 }[value]
        const parameters = { key: value, code: value, windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual }
        await browser.send('Input.dispatchKeyEvent', { ...parameters, type: 'keyDown', ...(value === 'Enter' ? { text: '\r' } : {}) })
        await browser.send('Input.dispatchKeyEvent', { ...parameters, type: 'keyUp' })
    }
    const navigate = async (language, width, reduced) => {
        await browser.send('Emulation.setDeviceMetricsOverride', {
            width, height: 900, deviceScaleFactor: 1, mobile: width === 390
        })
        await browser.send('Emulation.setEmulatedMedia', {
            features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }]
        })
        const target = new URL(url)
        target.searchParams.set('lang', language)
        await browser.send('Page.navigate', { url: target.href })
        await browser.waitFor('!!window.languageFixture && !!document.querySelector("[data-testid=translated-text]")', 30000)
        await browser.waitFor('document.documentElement.lang === ' + JSON.stringify(language))
        await evaluate('document.fonts.ready')
        await pause(150)
        await evaluate('languageFixture.start()')
    }
    const open = async keyboard => {
        await evaluate('document.querySelector("button[aria-haspopup=menu]").focus()')
        if (keyboard) await key('Enter')
        else await evaluate('document.querySelector("button[aria-haspopup=menu]").click()')
        await browser.waitFor('!!document.querySelector("[role=menuitem]")')
    }
    const select = async (language, keyboard) => {
        const label = labels[language]
        if (keyboard) {
            const index = Object.keys(labels).indexOf(language)
            for (let step = 0; step <= index; step++) await key('ArrowDown')
            assert.ok((await evaluate('document.activeElement.textContent')).includes(label))
            await key('Enter')
        } else {
            await evaluate('[...document.querySelectorAll("[role=menuitem]")].find(item => item.textContent.includes(' + JSON.stringify(label) + ')).click()')
        }
    }
    const unchanged = snapshot => {
        assert.deepEqual(snapshot.hidden, [])
        assert.equal(snapshot.mounts, 1)
        assert.equal(snapshot.unmounts, 0)
        assert.equal(snapshot.outerFallbacks, 0)
        assert.equal(snapshot.routeFallbacks, 0)
        assert.ok(snapshot.scrollWidth <= snapshot.width, 'No horizontal overflow')
    }
    for (const [width, reduced] of [[1280, false], [390, true]]) {
        if (process.env.LANGUAGE_PICKER_WIDTH && Number(process.env.LANGUAGE_PICKER_WIDTH) !== width) continue
        for (const language of Object.keys(labels)) {
            if (process.env.LANGUAGE_PICKER_LANGUAGE && process.env.LANGUAGE_PICKER_LANGUAGE !== language) continue
            if (process.env.LANGUAGE_PICKER_CASE !== 'selection') {
                await t.test(language + ': saved locale, icon and Escape (' + width + ')', async () => {
                    await navigate(language, width, reduced)
                    await open(true)
                    await key('Escape')
                    await browser.waitFor('!document.querySelector("[role=menu]")')
                    const snapshot = await evaluate('languageFixture.stop()')
                    unchanged(snapshot)
                    assert.deepEqual(snapshot.events, [])
                    assert.equal(snapshot.language, language)
                    assert.equal(snapshot.direction, language === 'fa' ? 'rtl' : 'ltr')
                    assert.equal(await evaluate('localStorage.getItem("i18nextLng")'), language)
                    assert.equal(await evaluate('document.activeElement?.getAttribute("aria-haspopup")'), 'menu')
                })
            }
            if (process.env.LANGUAGE_PICKER_CASE === 'saved') continue
            await t.test(language + ': one selection, retained draft (' + width + ')', async () => {
                await navigate('en', width, reduced)
                await evaluate(`(() => {
                    const input = document.querySelector('input[aria-label=Draft]')
                    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Unsaved language draft')
                    input.dispatchEvent(new Event('input', { bubbles: true }))
                    languageFixture.setDelay(700)
                })()`)
                await open(reduced)
                assert.deepEqual((await evaluate('languageFixture.snapshot()')).events, [])
                await select(language, reduced)
                if (language !== 'en') {
                    await pause(150)
                    const pending = await evaluate('languageFixture.snapshot()')
                    unchanged(pending)
                    assert.equal(pending.language, 'en')
                }
                await browser.waitFor('languageFixture.i18n.language === ' + JSON.stringify(language))
                await pause(200)
                const snapshot = await evaluate('languageFixture.stop()')
                unchanged(snapshot)
                const changed = snapshot.events.filter(event => event.name === 'languageChanged')
                const changing = snapshot.events.filter(event => event.name === 'languageChanging')
                assert.equal(changed.length, language === 'en' ? 0 : 1, 'A single choice must not repeat the global language update')
                assert.equal(changing.length, language === 'en' ? 0 : 1)
                assert.equal(snapshot.requests.length, language === 'en' ? 0 : 1)
                assert.ok(snapshot.current.text.length > 0)
                assert.equal(await evaluate('document.querySelector("input[aria-label=Draft]").value'), 'Unsaved language draft')
                assert.equal(await evaluate('localStorage.getItem("i18nextLng")'), language)
                assert.equal(snapshot.direction, language === 'fa' ? 'rtl' : 'ltr')
            })
        }
    }
    assert.deepEqual(browser.consoleErrors, [])
})

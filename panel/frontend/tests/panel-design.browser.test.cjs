const assert = require('node:assert/strict')
const path = require('node:path')
const { spawn } = require('node:child_process')
const test = require('node:test')
const { launchBrowser } = require('./fixtures/node-wizard/cdp.cjs')

test('remarks use the panel theme and preserve editing across locales and narrow layouts', {
    skip: process.env.PANEL_DESIGN_BROWSER !== '1', timeout: 180000
}, async t => {
    const root = path.resolve(__dirname, '..')
    const url = 'http://127.0.0.1:4362/'
    const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'),
        '--config', 'tests/fixtures/custom-remarks/vite.config.ts', '--host', '127.0.0.1',
        '--port', '4362', '--strictPort'], { cwd: root, stdio: 'ignore', windowsHide: true })
    t.after(() => server.kill())
    let ready = false
    for (let i = 0; i < 150; i++) {
        try { if ((await fetch(url)).ok) { ready = true; break } } catch {}
        await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(ready, 'fixture must start')
    const browser = await launchBrowser()
    t.after(() => browser.close())
    const navigate = async () => {
        await browser.send('Page.navigate', { url })
        await browser.waitFor('!!document.querySelector("form [data-panel-heading-icon]")', 60000)
    }
    await navigate()
    for (const theme of ['Dark', 'Light']) for (const width of [1280, 412]) {
        for (const lang of ['ru', 'en', 'fa', 'zh']) await t.test(`${theme} ${width} ${lang}`, async () => {
            await browser.evaluate(`localStorage.setItem('xera-panel-appearance-v1',JSON.stringify({theme:${JSON.stringify(theme)},accent:${JSON.stringify(theme === 'Dark' ? 'Coral' : 'Blue')},font:'Manrope',compact:false,reduceMotion:true}))`)
            await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 915, deviceScaleFactor: 1, mobile: false })
            await navigate()
            await browser.evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(lang)}).click()`)
            await browser.waitFor(`document.documentElement.dir===${JSON.stringify(lang === 'fa' ? 'rtl' : 'ltr')}`)
            const initial = await browser.evaluate(`(()=>{const f=document.querySelector('form');const h=f.querySelector('[data-panel-heading-icon]');const css=getComputedStyle(document.documentElement);return{width:innerWidth,scroll:document.documentElement.scrollWidth,icons:f.querySelectorAll('[data-panel-heading-icon]').length,surface:css.getPropertyValue('--panel-surface').trim(),iconColor:getComputedStyle(h).color,accent:css.getPropertyValue('--panel-accent-text').trim(),text:f.textContent}})()`)
            assert.ok(initial.scroll <= initial.width, 'no horizontal overflow')
            assert.equal(initial.icons, 5, 'page and four sections share branded heading tiles')
            assert.equal(initial.surface, theme === 'Dark' ? '#1c1c22' : '#ffffff')
            assert.ok(!initial.text.includes('interface.remarks-'), 'translations must resolve')
            await browser.evaluate(`document.querySelector('form [role="region"] button').click()`)
            await browser.waitFor('!!document.querySelector("form input:not([type=checkbox])")')
            const submit = await browser.evaluate(`(()=>{const b=document.querySelector('form button[type=submit]');const r=b.getBoundingClientRect();return{disabled:b.disabled,color:b.style.getPropertyValue('--button-color'),width:r.width}})()`)
            assert.equal(submit.disabled, false)
            assert.ok(submit.color.includes('brand'), 'Save follows the chosen panel accent')
            assert.ok(submit.width > 0)
            await browser.evaluate(`document.querySelector('form button[type=submit]').click()`)
            await browser.waitFor(`JSON.parse(document.querySelector('[data-testid="saved-payload"]').textContent).activeExpiry?.rules?.length===1`)
            assert.ok(await browser.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'expanded form must fit')
            await browser.evaluate(`document.querySelector('form button[aria-expanded=true]').click()`)
            assert.equal(await browser.evaluate(`JSON.parse(document.querySelector('[data-testid="saved-payload"]').textContent).activeExpiry.rules.length`), 1)
        })
    }
    assert.deepEqual(browser.consoleErrors, [])
})

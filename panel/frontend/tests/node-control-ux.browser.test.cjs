const assert = require('node:assert/strict')
const path = require('node:path')
const { spawn } = require('node:child_process')
const test = require('node:test')
const { launchBrowser } = require('./fixtures/node-wizard/cdp.cjs')
const root = path.resolve(__dirname, '..')

test('compact node controls use accessible icons and protect the final enabled address in real Chrome', {
    skip: process.env.NODE_CONTROL_UX_BROWSER !== '1', timeout: 180000
}, async t => {
    const url = process.env.NODE_CONTROL_UX_URL ?? 'http://127.0.0.1:4348/'
    const origin = new URL(url)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))
    try { await fetch(url, { signal: AbortSignal.timeout(1500) }) }
    catch {
        const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--config', 'tests/fixtures/node-scan/vite.config.ts', '--configLoader', 'runner', '--port', origin.port || '4348'], { cwd: root, stdio: 'ignore', windowsHide: true })
        t.after(() => server.kill())
        let ready = false
        for (let attempt = 0; attempt < 150; attempt++) {
            try { if ((await fetch(url)).ok) { ready = true; break } } catch {}
            await new Promise(resolve => setTimeout(resolve, 100))
        }
        assert.ok(ready, 'Loopback node scan fixture did not start')
    }
    const browser = await launchBrowser()
    t.after(() => browser.close())
    const action = `[...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === nodeWizardFixture.i18n.t('node-control-addresses.rescan') || el.textContent.trim() === nodeWizardFixture.i18n.t('node-control-addresses.rescan'))`
    const addressMenu = (address) => `[...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === nodeWizardFixture.i18n.t('node-control-addresses.actions', {address:${JSON.stringify(address)}}))`
    const remove = (address) => `[...document.querySelectorAll('[role=menuitem]')].find(el => el.getAttribute('aria-label') === nodeWizardFixture.i18n.t('node-control-addresses.remove', {address:${JSON.stringify(address)}}))`
    async function open(language = 'en', params = {}) {
        const target = new URL(url)
        target.searchParams.set('lang', language)
        for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value)
        await browser.navigate(target.href)
        await browser.waitFor('!!document.querySelector("[data-path=scan-form-note]")')
    }
    async function key(key, code = key) {
        const windowsVirtualKeyCode = ({ Tab: 9, Enter: 13, Escape: 27, ArrowDown: 40 })[key] ?? 32
        await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, ...(key === 'Enter' ? { text: '\r' } : {}) })
        await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode })
    }
    async function click(expression) {
        const point = await browser.evaluate(`(() => { const element = ${expression}; element.scrollIntoView({block:'center'}); const r = element.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`)
        await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
    }
    for (const language of ['en', 'ru', 'fa', 'zh']) {
        await t.test('IP status is selectable and independent of management permission (' + language + ')', async () => {
            await open(language)
            const before = await browser.evaluate('nodeWizardFixture.form().getValues().controlAddresses')
            await click(addressMenu('192.0.2.20'))
            await browser.waitFor('document.querySelectorAll("[role=menuitem]").length === 11')
            const roleColors = await browser.evaluate(`[...document.querySelectorAll('[role=menuitem]')].slice(0, 2).map(el => getComputedStyle(el.querySelector('svg')).color)`)
            assert.notEqual(roleColors[0], roleColors[1])
            assert.equal(await browser.evaluate(`document.querySelectorAll('[role=menuitem]')[10] === ${remove('192.0.2.20')}`), true)
            await click(`[...document.querySelectorAll('[role=menuitem]')].find(el => el.textContent.trim() === nodeWizardFixture.i18n.t('node-ip-statuses.outbound'))`)
            await browser.waitFor('nodeWizardFixture.form().getValues().ips[0].status === "OUTBOUND"')
            assert.deepEqual(await browser.evaluate('nodeWizardFixture.form().getValues().controlAddresses'), before)
            assert.equal(await browser.evaluate('nodeWizardFixture.form().isDirty("ips")'), true)
            assert.equal(await browser.evaluate('document.body.textContent.includes(nodeWizardFixture.i18n.t("operations.diagnostics"))'), false)
            await browser.evaluate(`(${action}).click()`)
            await browser.waitFor('Boolean(nodeWizardFixture.snapshot().cached)')
            assert.equal(await browser.evaluate('nodeWizardFixture.form().getValues().ips[0].status'), 'OUTBOUND')
            assert.equal(await browser.evaluate('nodeWizardFixture.form().isDirty("ips")'), true)
        })
        await t.test('icon-only scan has a translated name and keyboard tooltip (' + language + ')', async () => {
            await open(language)
            const button = await browser.evaluate(`(() => { const button = ${action}; return { text: button.textContent.trim(), label: button.getAttribute('aria-label'), expected: nodeWizardFixture.i18n.t('node-control-addresses.rescan') } })()`)
            assert.equal(button.text, '')
            assert.equal(button.label, button.expected)
            await browser.evaluate(`(${action}).focus()`)
            await browser.waitFor('!!document.querySelector("[role=tooltip]")')
            assert.equal(await browser.evaluate('document.querySelector("[role=tooltip]").textContent.includes(nodeWizardFixture.i18n.t("node-control-addresses.rescan-description"))'), true)
        })
        await t.test('last nonblank address stays on despite another enabled blank draft (' + language + ')', async () => {
            await open(language)
            assert.equal(await browser.evaluate('document.querySelector("input[role=switch]").disabled'), true)
            await browser.evaluate(`document.querySelector('input[role=switch]').click()`)
            assert.equal(await browser.evaluate('nodeWizardFixture.form().getValues().controlAddresses[0].enabled'), true)
            await browser.evaluate(`[...document.querySelectorAll('button')].find(el => el.textContent.trim() === nodeWizardFixture.i18n.t('node-control-addresses.add')).click()`)
            await browser.waitFor('document.querySelectorAll("input[role=switch]").length === 3')
            assert.equal(await browser.evaluate('document.querySelector("input[role=switch]").disabled'), true)
            assert.equal(await browser.evaluate('[...document.querySelectorAll("input[role=switch]")].at(-1).disabled'), false)
            await browser.evaluate(`document.querySelector('[data-path="scan-form-controlAddresses.0.address"]').focus()`)
            await key('Tab')
            assert.equal(await browser.evaluate(`document.activeElement === document.querySelector('input[role=switch]').closest('span[tabindex="0"]')`), true)
            await browser.waitFor('!!document.querySelector("[role=tooltip]")')
            assert.equal(await browser.evaluate('document.querySelector("[role=tooltip]").textContent.includes(nodeWizardFixture.i18n.t("node-control-addresses.last-enabled"))'), true)
            await key(' ', 'Space')
            assert.equal(await browser.evaluate('nodeWizardFixture.form().getValues().controlAddresses[0].enabled'), true)
            await browser.evaluate('[...document.querySelectorAll("input[role=switch]")].at(-1).click()')
            await browser.waitFor('document.querySelectorAll("input[role=switch]").length === 2')
        })
    }
    await t.test('manual remove drops a saved row and keeps the sole management route', async () => {
        await open('ru')
        await click(addressMenu('manual.example.test'))
        await browser.waitFor(`Boolean(${remove('manual.example.test')})`)
        assert.equal(await browser.evaluate(`(${remove('manual.example.test')}).disabled`), true)
        await key('Escape')
        await browser.waitFor(`!(${remove('manual.example.test')})`)
        await click(addressMenu('192.0.2.20'))
        await browser.waitFor(`Boolean(${remove('192.0.2.20')})`)
        await click(remove('192.0.2.20'))
        await browser.waitFor('nodeWizardFixture.form().getValues().controlAddresses.length === 1')
        assert.equal(await browser.evaluate('nodeWizardFixture.form().isDirty("controlAddresses")'), true)
        assert.deepEqual(await browser.evaluate('nodeWizardFixture.form().getValues().controlAddresses'), [
            { address: 'manual.example.test', enabled: true }
        ])
    })

    await t.test('a saved control address can be typed over while its switch is on', async () => {
        await open('ru', { state: 'two-enabled' })
        const input = 'input[data-path="scan-form-controlAddresses.1.address"]'
        await browser.evaluate(`document.querySelector(${JSON.stringify(input)}).select()`)
        assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(input)}).readOnly`), false)
        await browser.send('Input.insertText', { text: '2001:db8::25' })
        await browser.waitFor('nodeWizardFixture.form().getValues().controlAddresses[1].address === "2001:db8::25"')
        assert.deepEqual(await browser.evaluate('nodeWizardFixture.form().getValues().controlAddresses'), [
            { address: 'manual.example.test', enabled: true },
            { address: '2001:db8::25', enabled: true }
        ])
        assert.equal(await browser.evaluate('nodeWizardFixture.form().isDirty("controlAddresses")'), true)
    })

    await t.test('IPv6 role menu works with the keyboard and read-only mode disables role changes', async () => {
        await open('en')
        await browser.evaluate(`(${action}).click()`)
        await browser.waitFor('Boolean(nodeWizardFixture.snapshot().cached)')
        assert.deepEqual(await browser.evaluate('nodeWizardFixture.form().getValues().ips'), [{ ip: '2001:db8::30', status: 'UNKNOWN' }])
        await browser.evaluate(`(${addressMenu('2001:db8::30')}).focus()`)
        await key(' ', 'Space')
        await browser.waitFor('document.querySelectorAll("[role=menuitem]").length === 11')
        await browser.waitFor('document.activeElement?.hasAttribute("data-autofocus")')
        for (let index = 0; index < 6; index++) await key('ArrowDown')
        assert.equal(await browser.evaluate('document.activeElement.textContent.trim()'), await browser.evaluate('nodeWizardFixture.i18n.t("node-ip-statuses.reserve")'))
        await key('Enter')
        await browser.waitFor('nodeWizardFixture.form().getValues().ips[0].status === "RESERVE"')
        await open('en', { locked: '1' })
        assert.equal(await browser.evaluate(`(${addressMenu('192.0.2.20')}).disabled`), true)
    })
    await t.test('multiple enabled addresses can be toggled until one remains; legacy all-off can be repaired', async () => {
        await open('en', { state: 'two-enabled' })
        await browser.evaluate('document.querySelector("input[role=switch]").click()')
        await browser.waitFor('!nodeWizardFixture.form().getValues().controlAddresses[0].enabled')
        assert.deepEqual(await browser.evaluate('[...document.querySelectorAll("input[role=switch]")].map(el => ({checked: el.checked, disabled: el.disabled}))'), [{ checked: false, disabled: false }, { checked: true, disabled: true }])
        await open('en', { state: 'all-off' })
        assert.deepEqual(await browser.evaluate('[...document.querySelectorAll("input[role=switch]")].map(el => ({checked: el.checked, disabled: el.disabled}))'), [{ checked: false, disabled: false }, { checked: false, disabled: false }])
        await browser.evaluate('document.querySelector("input[role=switch]").focus()')
        await key(' ', 'Space')
        await browser.waitFor('nodeWizardFixture.form().getValues().controlAddresses[0].enabled')
        assert.equal(await browser.evaluate('document.querySelector("input[role=switch]").disabled'), true)
    })
    await t.test('dirty and saving states retain their scan blocks; pending scan submits once and preserves the description', async () => {
        await open()
        await browser.evaluate('document.querySelectorAll("input[role=switch]")[1].click()')
        await browser.waitFor(`(${action}).disabled`)
        await browser.evaluate(`(${action}).click()`)
        assert.equal(await browser.evaluate('nodeWizardFixture.snapshot().calls.length'), 0)
        await open('en', { locked: '1' })
        assert.equal(await browser.evaluate(`(${action}).disabled`), true)
        assert.equal(await browser.evaluate('[...document.querySelectorAll("input[role=switch]")].every(el => el.disabled)'), true)
        await open()
        await browser.evaluate('nodeWizardFixture.mode("hold")')
        await browser.evaluate(`(() => { const input = document.querySelector('[data-path=scan-form-note]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Unsaved description'); input.dispatchEvent(new Event('input', {bubbles:true})); (${action}).click(); (${action}).click(); })()`)
        await browser.waitFor('nodeWizardFixture.snapshot().calls.length === 1')
        assert.equal(await browser.evaluate(`(${action}).getAttribute('aria-disabled')`), 'true')
        assert.equal(await browser.evaluate(`(${action}).getAttribute('aria-busy')`), 'true')
        await browser.evaluate('nodeWizardFixture.releaseRequest()')
        await browser.waitFor('Boolean(nodeWizardFixture.snapshot().cached)')
        assert.equal(await browser.evaluate('nodeWizardFixture.form().getValues().note'), 'Unsaved description')
        assert.equal(await browser.evaluate('nodeWizardFixture.snapshot().calls.length'), 1)
    })
    await t.test('mobile touch and reduced motion retain tooltip access without horizontal overflow', async () => {
        await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
        await browser.send('Emulation.setTouchEmulationEnabled', { enabled: true })
        await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
        await open('fa')
        assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
        async function touch(expression) {
            const point = await browser.evaluate(`(() => { const element = ${expression}; element.scrollIntoView({block:'center'}); const rect = element.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; })()`)
            await browser.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
            await browser.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        }
        await touch(`document.querySelector('input[role=switch]').closest('span[tabindex="0"]')`)
        await browser.waitFor('!!document.querySelector("[role=tooltip]")')
        assert.equal(await browser.evaluate('document.querySelector("[role=tooltip]").textContent.includes(nodeWizardFixture.i18n.t("node-control-addresses.last-enabled"))'), true)
        await open('fa', { locked: '1' })
        await touch(`(${action}).parentElement`)
        await browser.waitFor('document.querySelector("[role=tooltip]")?.textContent.includes(nodeWizardFixture.i18n.t("node-control-addresses.rescan-description"))')
        assert.equal(await browser.evaluate('nodeWizardFixture.snapshot().calls.length'), 0)
    })
    assert.deepEqual(browser.consoleErrors, [])
})

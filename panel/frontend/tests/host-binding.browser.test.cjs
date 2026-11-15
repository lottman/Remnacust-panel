const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const { spawn } = require('node:child_process')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const fixture = path.join(root, 'tests/fixtures/host-binding')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

test('actual Host cards and table retain binding validity and stable address columns in Chrome', {
    skip: process.env.HOST_BINDING_BROWSER !== '1', timeout: 180000
}, async t => {
    const url = new URL(process.env.HOST_BINDING_URL ?? 'http://127.0.0.1:4353/')
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    let server
    try { await fetch(url, { signal: AbortSignal.timeout(1500) }) }
    catch {
        server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'),
            '--config', 'tests/fixtures/host-binding/vite.config.ts', '--configLoader', 'runner',
            '--port', url.port || '4353'], { cwd: root, stdio: 'ignore', windowsHide: true })
        t.after(() => server.kill())
    }
    let ready = false
    for (let attempt = 0; attempt < 200; attempt++) {
        try { ready = (await (await fetch(url, { signal: AbortSignal.timeout(1500) })).text()).includes('Host binding fixture') } catch {}
        if (ready) break
        if (server?.exitCode != null) throw new Error('Host fixture server exited before becoming ready')
        await pause(100)
    }
    assert.ok(ready, 'Host fixture did not start on its isolated loopback URL')
    const harness = new Module(path.join(fixture, 'browser.cjs'), module)
    harness.filename = path.join(fixture, 'browser.cjs')
    harness.paths = module.paths
    harness._compile(fs.readFileSync(path.join(root, 'tests/fixtures/node-wizard/cdp.cjs'), 'utf8'), harness.filename)
    const browser = await harness.exports.launchBrowser()
    t.after(() => browser.close())
    t.diagnostic((await browser.send('Browser.getVersion')).product)
    const evaluate = expression => browser.evaluate(expression)
    const key = async (value, virtual) => {
        const params = { key: value, code: value, windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual }
        await browser.send('Input.dispatchKeyEvent', { ...params, type: 'keyDown', ...(value === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) })
        await browser.send('Input.dispatchKeyEvent', { ...params, type: 'keyUp' })
    }
    const click = async selector => {
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`)
        const point = await evaluate(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`)
        await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
        await pause(80)
    }
    const screenshot = async name => {
        if (!process.env.HOST_BINDING_SCREENSHOT_DIR) return
        const directory = path.resolve(process.env.HOST_BINDING_SCREENSHOT_DIR)
        fs.mkdirSync(directory, { recursive: true })
        const result = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
        fs.writeFileSync(path.join(directory, name + '.png'), Buffer.from(result.data, 'base64'))
    }
    async function open(width, surface, language = 'en', columns = 1) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 })
        await browser.send('Emulation.setTouchEmulationEnabled', { enabled: width === 390 })
        await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
        const target = new URL(url)
        target.searchParams.set('surface', surface)
        target.searchParams.set('lang', language)
        target.searchParams.set('columns', String(columns))
        await browser.send('Page.navigate', { url: target.href })
        await browser.waitFor('!!window.hostBindingFixture && !!document.querySelector("[data-host-binding-fixture]")', 45000)
        await browser.waitFor(surface === 'table'
            ? '[...document.querySelectorAll("tbody tr")].some(row=>row.textContent.includes("Whitespace label"))'
            : 'document.querySelectorAll("[data-panel-motion=row]").length === 10')
        await evaluate('document.fonts.ready')
        await pause(200)
        await screenshot(`${surface}-${width}-${language}-${columns}`)
    }
    const cardStates = () => evaluate(`Object.fromEntries([...document.querySelectorAll('[data-host-case]')].map(section=>{
        const card=section.querySelector('[data-panel-motion=row]');
        return [section.dataset.hostCase,{invalid:card.className.includes('danglingItem'),text:card.textContent,border:getComputedStyle(card).borderColor,mobile:card.className.includes('mobileItem')}];
    }))`)
    const tableStates = () => evaluate(`Object.fromEntries([...document.querySelectorAll('tbody tr')].map(row=>{
        const item=hostBindingFixture.cases.find(item=>row.textContent.includes(item.remark));
        return item?[item.id,{invalid:(row.getAttribute('style')||'').includes('--mantine-color-red-light'),text:row.textContent,warning:!!row.querySelector('[role=img][aria-label="DANGLING"]')}]:[];
    }).filter(entry=>entry.length))`)
    const assertStates = (states, mobile) => {
        for (const id of ['invalid', 'moved', 'deleted']) {
            assert.ok(states[id]?.invalid, id + ' must be visibly invalid')
            assert.match(states[id].text, /DANGLING/, id)
            if (mobile !== undefined) assert.equal(states[id].mobile, mobile, id)
            else assert.ok(states[id].warning, id + ' must expose the invalid status to assistive technology')
        }
        for (const id of ['basic', 'rules', 'disabled', 'offline', 'ipv6', 'dns']) {
            assert.equal(states[id]?.invalid, false, id + ' must retain its valid binding')
            assert.doesNotMatch(states[id].text, /DANGLING/, id)
            if (mobile !== undefined) assert.equal(states[id].mobile, mobile, id)
        }
    }
    for (const width of [1280, 390]) {
        await open(width, 'cards')
        await t.test(`cards distinguish deleted, removed and moved inbounds from disabled/offline hosts at ${width}px`, async () => {
            const states = await cardStates()
            assertStates(states, width === 390)
            assert.notEqual(states.invalid.border, states.basic.border)
        })
        await t.test(`cards accept the DTO-supported whitespace profile label at ${width}px`, async () => {
            const state = (await cardStates()).whitespace
            assert.equal(state.invalid, false)
            assert.doesNotMatch(state.text, /DANGLING/)
            assert.match(state.text, /vless-current/)
        })
        await t.test(`long IPv6 and DNS cards stay within the ${width}px viewport`, async () => {
            assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth`))
            for (const id of ['ipv6', 'dns']) {
                const bounds = await evaluate(`(() => { const section=document.querySelector('[data-host-case=${id}]'); const address=section.querySelector('[class*=${width === 390 ? 'mobileAddress' : 'hostAddress'}]'); return {left:address.getBoundingClientRect().left,right:address.getBoundingClientRect().right,overflow:getComputedStyle(address).textOverflow,text:address.textContent}; })()`)
                assert.ok(bounds.left >= 0 && bounds.right <= width, JSON.stringify(bounds))
                assert.equal(bounds.overflow, 'ellipsis')
                assert.match(bounds.text, id === 'ipv6' ? /2001:db8:aaaa:bbbb:cccc:dddd:eeee:ffff:443/ : /a-very-long-synthetic-hostname/)
            }
        })
        if (width === 1280) {
            await t.test('address column stays aligned when four or five parameter icons are shown', async () => {
                const rects = await evaluate(`['basic','rules','ipv6','dns'].map(id=>{const section=document.querySelector('[data-host-case='+id+']'); const r=section.querySelector('[class*=hostAddress]').getBoundingClientRect(); return {id,left:r.left,right:r.right,center:r.left+r.width/2,buttons:section.querySelectorAll('button').length};})`)
                for (const rect of rects.slice(1)) assert.ok(Math.abs(rect.center - rects[0].center) < 1, JSON.stringify(rects))
                assert.equal(rects[0].buttons, 4)
                assert.equal(rects[1].buttons, 4, 'the extra squad indicator must not add a fake button')
            })
            await t.test('real parameter buttons retain labels, tooltips, keyboard actions and click isolation', async () => {
                assert.equal(await evaluate(`document.querySelectorAll('[data-host-case=basic] button:disabled').length`), 4)
                assert.ok(await evaluate(`[...document.querySelectorAll('[data-host-case=rules] button')].every(button=>button.getAttribute('aria-label')?.trim()&&!button.disabled)`))
                const muxPoint = await evaluate(`(() => { const button=document.querySelector('[data-host-case=rules] button[aria-label*=Mux]'); button.scrollIntoView({block:'center'}); button.focus(); const r=button.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`)
                await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...muxPoint })
                await browser.waitFor('!!document.querySelector("[role=tooltip]")')
                assert.match(await evaluate('document.querySelector("[role=tooltip]").textContent'), /Mux/)
                await key('Enter', 13)
                await browser.waitFor('!!document.querySelector("[role=dialog]")')
                assert.match(await evaluate('document.querySelector("[role=dialog]").textContent'), /enabled/)
                assert.equal(await evaluate('hostBindingFixture.modalCalls.length'), 0)
                await key('Escape', 27)
                await browser.waitFor('!document.querySelector("[role=dialog]")')
                const template = '[data-host-case=rules] button'
                await click(template)
                assert.equal(await evaluate('hostBindingFixture.openedUrls.length'), 1)
                assert.equal(await evaluate('hostBindingFixture.modalCalls.length'), 0)
                await click('[data-host-case=rules] input[type=checkbox]')
                assert.equal(await evaluate('document.querySelector("[data-host-case=rules] input").checked'), true)
                await click('[data-host-case=basic] [class*=headerName]')
                assert.equal(await evaluate('hostBindingFixture.modalCalls.at(-1).id'), 'hosts_editHostDrawer')
            })
        }
        await open(width, 'table')
        await t.test(`actual virtualized table distinguishes invalid bindings at ${width}px`, async () => {
            assertStates(await tableStates())
            assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
        })
        await t.test(`table accepts a whitespace profile label at ${width}px`, async () => {
            const state = (await tableStates()).whitespace
            assert.equal(state.invalid, false)
            assert.doesNotMatch(state.text, /DANGLING/)
            assert.match(state.text, /vless-current/)
        })
    }
    await open(1280, 'cards', 'en', 2)
    await t.test('narrow desktop cards keep addresses aligned and separate from wrapping controls', async () => {
        const bounds = await evaluate(`['basic','rules','ipv6','dns'].map(id=>{const section=document.querySelector('[data-host-case='+id+']');const a=section.querySelector('[class*=hostAddress]').getBoundingClientRect(),b=section.getBoundingClientRect(),actions=section.querySelector('[class*=parameterActions]').getBoundingClientRect();return {id,center:a.left+a.width/2-b.left,addressRight:a.right,actionsLeft:actions.left};})`)
        for (const rect of bounds) {
            assert.ok(Math.abs(rect.center - bounds[0].center) < 1, JSON.stringify(bounds))
            assert.ok(rect.addressRight <= rect.actionsLeft, JSON.stringify(bounds))
        }
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
    })
    await open(1280, 'cards', 'fa')
    await t.test('RTL cards retain a stable isolated address column', async () => {
        const bounds = await evaluate(`['basic','rules','ipv6','dns'].map(id=>{const address=document.querySelector('[data-host-case='+id+'] [class*=hostAddress]'); const r=address.getBoundingClientRect(),card=address.closest('[data-panel-motion=row]').getBoundingClientRect(); return {center:r.left+r.width/2,direction:getComputedStyle(address).direction,left:card.left,right:card.right};})`)
        for (const rect of bounds) {
            assert.equal(rect.direction, 'ltr')
            assert.ok(Math.abs(rect.center - bounds[0].center) < 1, JSON.stringify(bounds))
            assert.ok(rect.left >= 0 && rect.right <= 1280, JSON.stringify(bounds))
        }
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
    })
    assert.deepEqual(browser.consoleErrors, [])
})

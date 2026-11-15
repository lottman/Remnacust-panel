const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { spawn } = require('node:child_process')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { useForm } = require('@mantine/form')
const mantine = require('@mantine/core')
const contract = require('@remnawave/backend-contract')
const { QueryClient } = require('@tanstack/react-query')
const ts = require('typescript')
const load = require('../../backend/tests/load-typescript.cjs')
const root = path.resolve(__dirname, '..')
const addresses = load(path.join(root, 'src/shared/utils/node-control-addresses.ts'))
const state = load(path.join(root, 'src/shared/_modals/nodes/edit-node-modal/node-form-state.ts'), {
    '@shared/utils/node-control-addresses': addresses
})
const original = {
    uuid: '10000000-0000-4000-8000-000000000001',
    name: 'Saved node', note: 'Saved description', address: 'node.example.test',
    port: 2222, proxyUrl: null, isDisabled: false,
    controlRevision: '10000000-0000-4000-8000-000000000002',
    controlAddresses: [
        { address: 'node.example.test', enabled: true },
        { address: '192.0.2.20', enabled: false }
    ],
    ips: [{ ip: '192.0.2.20', status: 'INBOUND' }]
}
const scanned = {
    ...original, name: 'Server name', note: 'Server description',
    controlRevision: '10000000-0000-4000-8000-000000000003',
    controlAddresses: [original.controlAddresses[0], { address: '2001:db8::30', enabled: false }],
    ips: [{ ip: '2001:db8::30', status: 'OUTBOUND' }],
    ipScan: { addresses: ['2001:db8::30'], scannedAt: '2026-11-15T12:00:00.000Z' }
}
function formFor(values = original) {
    let form
    function Harness() {
        form = useForm({ name: 'scan-form', mode: 'uncontrolled', initialValues: structuredClone(values) })
        return null
    }
    renderToStaticMarkup(React.createElement(Harness))
    return form
}

test('scan merges fresh connection data and roles while preserving dirty name and description', () => {
    const form = formFor()
    const serverBefore = structuredClone(scanned)
    form.setFieldValue('name', 'My unsaved name')
    form.setFieldValue('note', 'My unsaved description')
    const touched = structuredClone(form.getTouched())
    assert.equal(state.applyNodeIpScanResult(form, scanned), true)
    assert.deepEqual(form.getValues().controlAddresses, scanned.controlAddresses)
    assert.deepEqual(form.getValues().ips, scanned.ips)
    assert.equal(form.getValues().controlRevision, scanned.controlRevision)
    assert.equal(form.getValues().address, original.address)
    assert.equal(form.getValues().name, 'My unsaved name')
    assert.equal(form.getValues().note, 'My unsaved description')
    assert.equal(form.isDirty('controlAddresses'), false)
    assert.equal(form.isDirty('ips'), false)
    assert.equal(form.isDirty('name'), true)
    assert.equal(form.isDirty('note'), true)
    assert.deepEqual(state.getNodeUpdateValues(form.getValues(), field => form.isDirty(field)), {
        uuid: original.uuid, name: 'My unsaved name', note: 'My unsaved description'
    })
    assert.equal(Object.hasOwn(form.getValues(), 'ipScan'), false)
    assert.deepEqual(form.getTouched(), touched)
    assert.deepEqual(scanned, serverBefore)
})

test('an untouched form stays untouched after automatic inventory refresh so polling remains enabled', () => {
    const form = formFor()
    assert.equal(form.isTouched(), false)
    assert.equal(state.applyNodeIpScanResult(form, scanned), true)
    assert.equal(form.isTouched(), false)
    assert.equal(form.isDirty(), false)
})

test('reverting a connection edit after scan cannot hide unrelated dirty drafts from Save or navigation guards', () => {
    const form = formFor()
    form.setFieldValue('name', 'Unsaved name')
    form.setFieldValue('note', 'Unsaved description')
    assert.equal(state.applyNodeIpScanResult(form, scanned), true)
    form.setFieldValue('port', 3333)
    form.setFieldValue('port', original.port)
    assert.equal(form.isDirty('port'), false)
    assert.equal(form.isDirty('name'), true)
    assert.equal(form.isDirty('note'), true)
    assert.equal(form.isDirty(), true)
    form.setFieldValue('name', original.name)
    form.setFieldValue('note', original.note)
    assert.equal(form.isDirty(), false)
})

test('a pre-scan GET cannot overwrite the fresh canonical addresses after mutation success', async () => {
    const key = ['nodes', 'getNode', { uuid: original.uuid }]
    const { cacheNodeAfterWrite } = load(path.join(root, 'src/shared/_modals/nodes/edit-node-modal/node-query-state.ts'), {
        '@shared/api/hooks/nodes/nodes.query.hooks': { nodesQueryKeys: { getNode: () => ({ queryKey: key }) } }
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    let finishRead
    const read = client.fetchQuery({ queryKey: key, queryFn: () => new Promise(resolve => { finishRead = resolve }) }).catch(() => undefined)
    await Promise.resolve()
    await cacheNodeAfterWrite(client, original.uuid, scanned)
    finishRead(original)
    await read
    await Promise.resolve()
    assert.deepEqual(client.getQueryData(key), scanned)
    client.clear()
})

test('save and conflict reload baseline updates retain unrelated drafts and subsequent same-field edits', () => {
    for (const refreshedFields of [['name'], ['port', 'controlAddresses', 'proxyUrl', 'controlRevision']]) {
        const form = formFor()
        form.setFieldValue('name', 'Changed again after request')
        form.setFieldValue('note', 'Unsaved description')
        const initial = { ...form.getInitialValues(), name: refreshedFields.includes('name') ? 'Earlier submitted name' : original.name }
        state.resetNodeFormDirty(form, initial, refreshedFields)
        form.setFieldValue('port', 3333)
        form.setFieldValue('port', original.port)
        assert.equal(form.isDirty('name'), true)
        assert.equal(form.isDirty('note'), true)
        assert.equal(form.isDirty(), true)
        form.setFieldValue('name', initial.name)
        form.setFieldValue('note', original.note)
        assert.equal(form.isDirty(), false)
    }
})

test('connection changes made while a scan is running prevent any partial merge or revision advance', () => {
    for (const [field, value] of [
        ['controlAddresses', [{ address: 'manual.example.test', enabled: false }]],
        ['port', 3333], ['proxyUrl', 'socks5://proxy.example.test:1080']
    ]) {
        const form = formFor()
        form.setFieldValue(field, value)
        const values = structuredClone(form.getValues())
        const initial = structuredClone(form.getInitialValues())
        assert.equal(state.hasNodeConnectionChanges(form), true)
        assert.equal(state.applyNodeIpScanResult(form, scanned), false)
        assert.deepEqual(form.getValues(), values)
        assert.deepEqual(form.getInitialValues(), initial)
        assert.equal(form.getValues().controlRevision, original.controlRevision)
    }
})

test('scan keeps unsaved IP role edits dirty and retains an all-off authoritative list', () => {
    const form = formFor()
    const ips = [{ ip: '192.0.2.20', status: 'OUTBOUND' }]
    form.setFieldValue('ips', ips)
    const allOff = { ...scanned, controlAddresses: scanned.controlAddresses.map(entry => ({ ...entry, enabled: false })) }
    assert.equal(state.applyNodeIpScanResult(form, allOff), true)
    assert.deepEqual(form.getValues().ips, ips)
    assert.equal(form.isDirty('ips'), true)
    assert.ok(form.getValues().controlAddresses.every(entry => !entry.enabled))
})

function elements(value) {
    if (Array.isArray(value)) return value.flatMap(elements)
    return value?.props ? [value, ...elements(value.props.children)] : []
}
function card(form, node = original, extra = {}) {
    const mocks = {
        'react-i18next': { useTranslation: () => ({ t: key => key, i18n: { language: 'en' } }) },
        '@shared/_modals/nodes/edit-node-modal/node-diagnostics': { NodeDiagnostics: 'diagnostics' },
        '@shared/_modals/nodes/edit-node-modal/node-form-state': state,
        '@shared/ui/node-ips/node-control-addresses-editor': { NodeControlAddressesEditor: 'editor' },
        '@shared/utils/node-control-addresses': addresses
    }
    const ref = { exports: {} }
    const source = fs.readFileSync(path.join(root, 'src/shared/ui/forms/nodes/base-node-form/node-ips.card.tsx'), 'utf8')
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    new Function('require', 'module', 'exports', code)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), ref, ref.exports)
    const { NodeIpsCard } = ref.exports
    const tree = elements(NodeIpsCard({ form, node, cardVariants: {}, motionWrapper: 'section', onRescanIps() {}, ...extra }))
    const editor = tree.find(item => item.type === 'editor')
    return { tree, editor, action: elements(editor.props.rescanAction).find(item => item.type === mantine.Button) }
}

test('scan action blocks unsaved routes, disabled nodes, all-off lists, missing revisions and pending operations', () => {
    assert.equal(card(formFor()).action.props.disabled, false)
    for (const field of ['controlAddresses', 'port', 'proxyUrl']) {
        const form = formFor()
        const value = field === 'controlAddresses' ? [...original.controlAddresses, { address: 'manual.example.test', enabled: true }]
            : field === 'port' ? 3333 : 'socks5://proxy.example.test:1080'
        form.setFieldValue(field, value)
        const rendered = card(form)
        assert.equal(rendered.action.props.disabled, true)
        assert.ok(rendered.tree.some(item => item.props.children === 'node-control-addresses.rescan-save-first'))
    }
    for (const node of [{ ...original, isDisabled: true }, { ...original, controlRevision: null },
        { ...original, controlAddresses: original.controlAddresses.map(entry => ({ ...entry, enabled: false })) }]) {
        assert.equal(card(formFor(node), node).action.props.disabled, true)
    }
    for (const extra of [{ disabled: true }, { rescanDisabled: true }, { disabled: true, isRescanningIps: true }]) {
        assert.equal(card(formFor(), original, extra).action.props.disabled, true)
    }
    const form = formFor()
    form.setFieldValue('note', 'Unsaved description')
    assert.equal(card(form).action.props.disabled, false)
    assert.equal(card(form).action.props.type, 'button')
})

test('last scan uses readonly server metadata and automatic/manual discovery help stays visible', () => {
    const rendered = card(formFor(scanned), scanned)
    assert.deepEqual(rendered.editor.props.ips, scanned.ips)
    assert.ok(rendered.tree.some(item => item.props.children === 'node-control-addresses.rescan-last'))
    assert.ok(rendered.tree.some(item => item.props.children === 'node-control-addresses.discovery-help'))
})

test('rescan hook uses the generated revision-protected POST and standard node response', () => {
    const hooks = load(path.join(root, 'src/shared/api/hooks/nodes/nodes.mutation.hooks.ts'), {
        '@shared/utils/translate-mutation-message': { translateMutationMessage: value => value },
        '../../tsq-helpers': { createMutationHook: config => config }
    })
    const hook = hooks.useRescanNodeIps
    const command = contract.RescanNodeIpsCommand
    assert.equal(hook.endpoint, command.TSQ_url)
    assert.equal(hook.requestMethod.toLowerCase(), 'post')
    assert.equal(hook.routeParamsSchema, command.RequestParamSchema)
    assert.equal(hook.bodySchema, command.RequestBodySchema)
    assert.equal(hook.responseSchema, command.ResponseSchema)
    assert.equal(hook.bodySchema.safeParse({ controlRevision: original.controlRevision }).success, true)
    assert.equal(hook.bodySchema.safeParse({}).success, false)
    assert.equal(hook.bodySchema.safeParse({ controlRevision: 'stale-invalid-revision' }).success, false)
})

test('all scan errors are actionable and localized without exposing a raw server response', () => {
    for (const language of ['ru', 'en', 'fa', 'zh']) {
        const locale = JSON.parse(fs.readFileSync(path.join(root, 'public/locales', language, 'remnawave.json'), 'utf8'))
        const { RequestError } = load(path.join(root, 'src/shared/api/helpers/handler-request-error.ts'), {
            'consola/browser': { consola: { log() {} } },
            i18next: { t: key => key.split('.').reduce((value, part) => value?.[part], locale) ?? key }
        })
        for (const [code, status] of [['A267', 503], ['A268', 409], ['A269', 502], ['A270', 409], ['A271', 429]]) {
            const error = new RequestError({ response: { status, data: { errorCode: code, message: 'private-response-must-stay-hidden' } } })
            assert.equal(error.errorCode, code)
            assert.ok(error.message.includes(locale.requestErrors.codes[code]))
            assert.ok(!error.message.includes('private-response'))
        }
        assert.ok(locale.requestErrors.codes.A268.includes('1.1.38'))
        assert.ok(locale['node-control-addresses']['discovery-help'])
    }
})

test('real scan card, mutation, response parsing and cache merge in loopback Chrome', {
    skip: process.env.NODE_IP_SCAN_BROWSER !== '1', timeout: 180000
}, async t => {
    const url = process.env.NODE_IP_SCAN_URL ?? 'http://127.0.0.1:4348/'
    const origin = new URL(url)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))
    try { await fetch(url, { signal: AbortSignal.timeout(1500) }) }
    catch {
        const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--config', 'tests/fixtures/node-scan/vite.config.ts', '--port', origin.port || '4348'], { cwd: root, stdio: 'ignore', windowsHide: true })
        t.after(() => server.kill())
        for (let attempt = 0; attempt < 100; attempt++) {
            try { if ((await fetch(url)).ok) break } catch {}
            await new Promise(resolve => setTimeout(resolve, 100))
        }
    }
    const { launchBrowser } = require('./fixtures/node-wizard/cdp.cjs')
    const browser = await launchBrowser()
    t.after(() => browser.close())
    async function open(language = 'en') {
        const target = new URL(url)
        target.searchParams.set('lang', language)
        await browser.navigate(target.href)
        await browser.waitFor('!!document.querySelector("[data-path=scan-form-note]")')
    }
    const action = `[...document.querySelectorAll('button')].find(el => el.textContent.trim() === nodeWizardFixture.i18n.t('node-control-addresses.rescan'))`
    await t.test('one POST refreshes IPv6, cache and revision while preserving the description', async () => {
        await open()
        await browser.evaluate(`(() => {
            const input = document.querySelector('[data-path=scan-form-note]');
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Unsaved scan description');
            input.dispatchEvent(new Event('input', {bubbles:true}));
            input.dispatchEvent(new Event('change', {bubbles:true}));
            const button = ${action}; button.click(); button.click();
        })()`)
        await browser.waitFor('nodeWizardFixture.snapshot().cached?.controlRevision.endsWith("000003")')
        const result = await browser.evaluate('nodeWizardFixture.snapshot()')
        assert.equal(result.calls.length, 1)
        assert.equal(result.calls[0].method, 'post')
        assert.equal(result.calls[0].url, contract.RescanNodeIpsCommand.url(original.uuid))
        assert.deepEqual(result.calls[0].data, { controlRevision: original.controlRevision })
        assert.equal(result.values.note, 'Unsaved scan description')
        assert.deepEqual(result.values.controlAddresses, [{ address: 'manual.example.test', enabled: true }, { address: '2001:db8::30', enabled: false }])
        assert.equal(result.values.controlRevision, result.cached.controlRevision)
        assert.deepEqual(result.values.ips, result.cached.ips)
        assert.equal(await browser.evaluate('nodeWizardFixture.form().isDirty("note")'), true)
        assert.equal(await browser.evaluate('nodeWizardFixture.form().isDirty("controlAddresses")'), false)
    })
    await t.test('dirty address switch disables rescan and shows save-first guidance', async () => {
        await open()
        await browser.evaluate('document.querySelector("input[role=switch]").click()')
        await browser.waitFor(`Boolean((${action}).disabled)`)
        await browser.evaluate(`(${action}).click()`)
        assert.equal(await browser.evaluate('nodeWizardFixture.snapshot().calls.length'), 0)
        assert.equal(await browser.evaluate('document.body.textContent.includes(nodeWizardFixture.i18n.t("node-control-addresses.rescan-save-first"))'), true)
    })
    for (const language of ['en', 'ru', 'fa', 'zh']) await t.test('unsupported node retains addresses and has localized guidance (' + language + ')', async () => {
        await open(language)
        await browser.evaluate(`nodeWizardFixture.mode('unsupported'); (${action}).click()`)
        await browser.waitFor('document.body.textContent.includes(nodeWizardFixture.i18n.t("requestErrors.codes.A268"))')
        const result = await browser.evaluate('nodeWizardFixture.snapshot()')
        assert.equal(result.values.controlRevision, original.controlRevision)
        assert.equal(result.values.controlAddresses.length, 2)
        assert.equal(result.cached, undefined)
        assert.equal(await browser.evaluate('document.body.textContent.includes(nodeWizardFixture.i18n.t("node-control-addresses.rescan-success"))'), false)
    })
    for (const [mode, key] of [['unavailable', 'A267'], ['invalid', 'A269'], ['disabled', 'A270'], ['busy', 'A271'], ['conflict', 'A266'], ['bad-response', 'invalidResponse']]) {
        await t.test(mode + ' retains the saved list and never signals success', async () => {
            await open()
            await browser.evaluate(`nodeWizardFixture.mode(${JSON.stringify(mode)}); (${action}).click()`)
            const translation = key.startsWith('A') ? 'requestErrors.codes.' + key : 'requestErrors.' + key
            await browser.waitFor(`document.body.textContent.includes(nodeWizardFixture.i18n.t(${JSON.stringify(translation)}))`)
            const result = await browser.evaluate('nodeWizardFixture.snapshot()')
            assert.equal(result.calls.length, 1)
            assert.equal(result.values.controlRevision, original.controlRevision)
            assert.equal(result.cached, undefined)
            assert.equal(await browser.evaluate('document.body.textContent.includes(nodeWizardFixture.i18n.t("node-control-addresses.rescan-success"))'), false)
        })
    }
    for (const mode of ['empty', 'all-off']) await t.test(mode + ' response keeps the manual hostname and authoritative toggles', async () => {
        await open()
        await browser.evaluate(`nodeWizardFixture.mode(${JSON.stringify(mode)}); (${action}).click()`)
        await browser.waitFor('Boolean(nodeWizardFixture.snapshot().cached)')
        const result = await browser.evaluate('nodeWizardFixture.snapshot()')
        assert.equal(result.values.controlAddresses[0].address, 'manual.example.test')
        if (mode === 'empty') assert.equal(result.values.controlAddresses.length, 1)
        else assert.ok(result.values.controlAddresses.every(entry => !entry.enabled))
    })
})

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { useForm } = require('@mantine/form')
const load = require('../../backend/tests/load-typescript.cjs')
const contract = load(path.resolve(__dirname, '../../backend/libs/contract/models/node-control-addresses.schema.ts'))
const addresses = load(path.resolve(__dirname, '../src/shared/utils/node-control-addresses.ts'), { '@remnawave/backend-contract': contract })
const { getNodeUpdateValues, getNodeConnectionValues } = load(path.resolve(__dirname,
    '../src/shared/_modals/nodes/edit-node-modal/node-form-state.ts'), { '@shared/utils/node-control-addresses': addresses })
const original = {
    uuid: '10000000-0000-4000-8000-000000000001', name: 'Original node', address: '192.0.2.1',
    port: 2222, proxyUrl: 'socks5://fixture:synthetic-only@proxy.example.test:1080',
    controlRevision: '10000000-0000-4000-8000-000000000002',
    controlAddresses: [{ address: '192.0.2.1', enabled: true }]
}

test('canonical address, port and proxy patches carry the loaded revision and omit unchanged credentials', () => {
    for (const field of ['controlAddresses', 'port', 'proxyUrl']) {
        const patch = getNodeUpdateValues(original, key => key === field)
        assert.equal(patch.controlRevision, original.controlRevision)
        assert.deepEqual(Object.keys(patch).sort(), ['uuid', 'controlRevision', field].sort())
        assert.equal('proxyUrl' in patch, field === 'proxyUrl')
        assert.equal('address' in patch, false)
    }
    assert.deepEqual(getNodeUpdateValues(original, key => key === 'name'), { uuid: original.uuid, name: original.name })
    const clearing = getNodeUpdateValues({ ...original, proxyUrl: null }, key => key === 'proxyUrl')
    assert.equal(clearing.proxyUrl, null)
    assert.equal(clearing.controlRevision, original.controlRevision)
})

test('explicit connection reload replaces its draft and revision while preserving unrelated unsaved fields', () => {
    let form
    function Harness() { form = useForm({ mode: 'uncontrolled', initialValues: structuredClone(original) }); return null }
    renderToStaticMarkup(React.createElement(Harness))
    form.setFieldValue('name', 'My unsaved node name')
    form.setFieldValue('controlAddresses', [{ address: '2001:db8::2', enabled: true }])
    const latest = getNodeConnectionValues({ ...original, controlRevision: '10000000-0000-4000-8000-000000000003',
        controlAddresses: [{ address: '192.0.2.1', enabled: false }], proxyUrl: null, port: 3333 })
    const initial = { ...form.getInitialValues(), ...latest }
    form.setInitialValues(initial)
    for (const [field, value] of Object.entries(latest)) form.setFieldValue(field, value)
    form.resetDirty(initial)
    assert.equal(form.getValues().name, 'My unsaved node name')
    assert.equal(form.isDirty('name'), true)
    assert.equal(form.isDirty('controlAddresses'), false)
    assert.equal(form.getValues().controlRevision, latest.controlRevision)
    assert.deepEqual(form.getValues().controlAddresses, [{ address: '192.0.2.1', enabled: false }])
    assert.equal(form.getValues().address, original.address)
    assert.equal(form.getValues().proxyUrl, null)
})

test('the installed client schemas accept canonical creation and retain revision-protected all-off updates', () => {
    const { CreateNodeCommand, UpdateNodeCommand } = require('@remnawave/backend-contract')
    const created = CreateNodeCommand.RequestBodySchema.safeParse({
        name: 'Canonical node', controlAddresses: [{ address: '[2001:DB8::20]', enabled: true }],
        configProfile: { activeConfigProfileUuid: '10000000-0000-4000-8000-000000000004', activeInbounds: [] }
    })
    assert.equal(created.success, true)
    assert.equal(created.data.address, undefined)
    assert.equal(created.data.controlAddresses[0].address, '2001:db8::20')
    const patch = getNodeUpdateValues({ ...original, controlAddresses: [] }, field => field === 'controlAddresses')
    const parsed = UpdateNodeCommand.RequestBodySchema.safeParse(patch)
    assert.equal(parsed.success, true)
    assert.deepEqual(parsed.data.controlAddresses, [])
    assert.equal(parsed.data.controlRevision, original.controlRevision)
    assert.equal(UpdateNodeCommand.RequestBodySchema.safeParse({ uuid: original.uuid, controlAddresses: [] }).success, false)
})

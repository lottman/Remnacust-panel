const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const ts = require('typescript')
const load = require('../../backend/tests/load-typescript.cjs')
const { source } = require('../../backend/tests/upstream-filter-fixture.cjs')
const { schema } = require('../../backend/tests/client-pool-fixture.cjs')
const editor = path.join(
    __dirname,
    '../src/widgets/dashboard/templates/subscription-template-editor'
)
const model = load(path.join(editor, 'autoselect-model.ts'))
const { importAddressRules } = load(path.join(editor, 'geofile-address-rules.ts'))
const { xrayTemplateWarnings } = load(
    path.join(__dirname, '../../backend/src/modules/subscription-template/template-validation.ts'),
    { '@libs/contracts/models': schema }
)
const { selectInjectHosts } = source(
    'modules/subscription-template/generators/inject-host-selection.ts'
)
const { XrayJsonGeneratorService } = source(
    'modules/subscription-template/generators/xray-json.generator.service.ts',
    {
        './inject-host-selection': { selectInjectHosts },
        './rendered-xray-routes': source(
            'modules/subscription-template/generators/rendered-xray-routes.ts'
        ),
        '../host-mapper': { applyHostMapper: (value) => value },
        '@common/utils': { isNonEmptyObject: (value) => value && Object.keys(value).length > 0 }
    }
)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const pool = (tagPrefix = 'auto', extra = {}) => ({
    tagPrefix,
    mode: 'all',
    selectFrom: 'ALL',
    selector: { type: 'uuids', values: [id(1), id(2)] },
    ...extra
})
function imported() {
    const text = model.addPool(
        JSON.stringify({
            dns: { servers: ['localhost'] },
            outbounds: [{ tag: 'direct', protocol: 'freedom' }]
        }),
        [id(1), id(2)]
    )
    return importAddressRules(
        text,
        'XRAY_JSON',
        '{"type":"field","domain":["full:example.test"],"outboundTag":"auto"},'
    )
}
function parity(config, expected) {
    const before = structuredClone(config)
    assert.equal(model.validationPath(config), expected)
    assert.deepEqual(xrayTemplateWarnings(config), expected ? [expected] : [])
    assert.deepEqual(config, before, 'validation keeps the draft intact')
}

test('renaming a pool transfers imported and numeric generated outbound references only', () => {
    const input = JSON.parse(imported())
    input.outbounds.push(
        ...['auto-eu', 'auto-1', 'auto-02', 'proxy'].map((tag) => ({ tag, protocol: 'freedom' }))
    )
    input.routing.balancers.push({ tag: 'auto', selector: ['auto'], strategy: { type: 'random' } })
    input.routing.rules.push(
        { domain: ['full:second.test'], outboundTag: 'auto-2', port: '443' },
        ...['auto-eu', 'auto-1', 'auto-02', 'proxy', 'direct'].map((outboundTag) => ({
            domain: ['full:keep.test'],
            outboundTag
        })),
        { domain: ['full:balance.test'], balancerTag: 'auto' }
    )
    const original = structuredClone(input)
    const output = JSON.parse(model.renamePoolPrefix(JSON.stringify(input), 0, 'renamed'))
    assert.deepEqual(
        output.routing.rules,
        input.routing.rules.map((rule) => ({
            ...rule,
            ...(['auto', 'auto-2'].includes(rule.outboundTag)
                ? { outboundTag: rule.outboundTag.replace('auto', 'renamed') }
                : {})
        }))
    )
    assert.equal(output.remnawave.injectHosts[0].tagPrefix, 'renamed')
    assert.deepEqual(
        output.routing.balancers.map((balance) => balance.selector),
        [['renamed'], ['renamed']]
    )
    assert.deepEqual(output.outbounds, input.outbounds)
    assert.deepEqual(output.dns, input.dns)
    assert.deepEqual(input, original)
    parity(output, null)
})

test('pool and unified-group deletion reject imported outbound dependencies without changing the draft', () => {
    const text = imported()
    for (const remove of [
        (value) => model.removePool(value, 0),
        (value) => model.removeAutoselectGroup(value, model.autoselectGroups(JSON.parse(value))[0])
    ]) {
        let draft = text
        assert.throws(() => {
            draft = remove(draft)
        }, /routing\.rules\.0\.outboundTag/)
        assert.equal(draft, text)
    }
    const numeric = JSON.parse(text)
    numeric.routing.rules[0].outboundTag = 'auto-2'
    assert.throws(
        () => model.removePool(JSON.stringify(numeric), 0),
        /routing\.rules\.0\.outboundTag/
    )
    const retargeted = JSON.parse(text)
    retargeted.routing.rules[0].outboundTag = 'direct'
    const removed = JSON.parse(model.removePool(JSON.stringify(retargeted), 0))
    assert.deepEqual(removed.routing.rules, [retargeted.routing.rules[0]])
    parity(removed, null)
})

test('fixed-pool rename rejects empty, colliding or host-derived ambiguous destinations atomically', () => {
    const text = imported()
    for (const name of ['', 'direct'])
        assert.throws(() => model.renamePoolPrefix(text, 0, name), /routing\.rules\.0\.outboundTag/)
    const dynamic = JSON.parse(text)
    dynamic.remnawave.injectHosts.push(pool('unused', { useHostRemarkAsTag: true }))
    assert.throws(
        () => model.renamePoolPrefix(JSON.stringify(dynamic), 0, 'new'),
        /routing\.rules\.0\.outboundTag/
    )
})

test('unused legacy prefixes and existing static/recipient targets are never converted into pool routes', () => {
    for (const naming of ['useHostRemarkAsTag', 'useHostTagAsTag']) {
        const config = {
            outbounds: [{ tag: 'direct', protocol: 'freedom' }],
            remnawave: { injectHosts: [pool('direct', { [naming]: true })] },
            routing: {
                balancers: [{ tag: 'manual', selector: ['direct'], fallbackTag: 'direct' }],
                rules: [{ domain: ['full:keep.test'], outboundTag: 'direct' }]
            },
            observatory: { subjectSelector: ['direct'] }
        }
        const renamed = JSON.parse(model.renamePoolPrefix(JSON.stringify(config), 0, 'new'))
        assert.deepEqual(renamed.routing, config.routing)
        assert.deepEqual(renamed.observatory, config.observatory)
        const removed = JSON.parse(model.removePool(JSON.stringify(config), 0))
        assert.deepEqual(removed.routing.rules, config.routing.rules)
        parity(renamed, null)
        parity(removed, null)
    }
    const recipient = {
        remnawave: { injectHosts: [pool('proxy')], addVirtualHostAsOutbound: true },
        routing: { rules: [{ outboundTag: 'proxy', domain: ['full:keep.test'] }] }
    }
    assert.deepEqual(
        JSON.parse(model.renamePoolPrefix(JSON.stringify(recipient), 0, 'new')).routing.rules,
        recipient.routing.rules
    )
    assert.deepEqual(
        JSON.parse(model.removePool(JSON.stringify(recipient), 0)).routing.rules,
        recipient.routing.rules
    )
    const sourceProxy = structuredClone(recipient)
    delete sourceProxy.remnawave.addVirtualHostAsOutbound
    assert.throws(
        () => model.removePool(JSON.stringify(sourceProxy), 0),
        /routing\.rules\.0\.outboundTag/,
        'deleting the last proxy pool must not silently bind its rule to the normal recipient'
    )
})

test('repairing overlapping fixed prefixes preserves a reference supplied by another pool', () => {
    const config = {
        remnawave: { injectHosts: [pool(), pool('auto-2')] },
        routing: { rules: [{ outboundTag: 'auto-2', domain: ['full:keep.test'] }] }
    }
    for (const text of [
        model.renamePoolPrefix(JSON.stringify(config), 0, 'new'),
        model.removePool(JSON.stringify(config), 0)
    ]) {
        const output = JSON.parse(text)
        assert.deepEqual(output.routing.rules, config.routing.rules)
        parity(output, null)
    }
})

test('code-authored missing outbound and balancer destinations produce the same precise warning as backend', () => {
    for (const tag of ['missing', 'DIRECT', 'REJECT', 'auto-1', 'auto-02', 'auto-other'])
        parity(
            { remnawave: { injectHosts: [pool()] }, routing: { rules: [{ outboundTag: tag }] } },
            'routing.rules.0.outboundTag'
        )
    for (const tag of ['auto', 'auto-2', 'auto-10'])
        parity(
            { remnawave: { injectHosts: [pool()] }, routing: { rules: [{ outboundTag: tag }] } },
            null
        )
    for (const tag of ['DIRECT', 'REJECT', '__proto__', 'constructor'])
        parity({ outbounds: [{ tag }], routing: { rules: [{ outboundTag: tag }] } }, null)
    parity(
        { outbounds: [{ tag: 'auto' }], routing: { rules: [{ balancerTag: 'auto' }] } },
        'routing.rules.0.balancerTag'
    )
    parity(
        {
            routing: {
                balancers: [{ tag: 'auto', selector: ['proxy'] }],
                rules: [{ balancerTag: 'auto' }]
            }
        },
        null
    )
    const orphan = JSON.parse(imported())
    delete orphan.remnawave.injectHosts
    orphan.routing.balancers[0].fallbackTag = 'direct'
    parity(orphan, 'routing.rules.0.outboundTag')
})

test('implicit proxy and host-derived names follow generator/backend validation semantics', () => {
    for (const remnawave of [
        undefined,
        {},
        { injectHosts: [] },
        { injectHosts: [pool()] },
        { injectHosts: [], addVirtualHostAsOutbound: true },
        { injectHosts: [pool()], addVirtualHostAsOutbound: true }
    ]) {
        const available = !remnawave || !remnawave.injectHosts || remnawave.addVirtualHostAsOutbound
        parity(
            { ...(remnawave ? { remnawave } : {}), routing: { rules: [{ outboundTag: 'proxy' }] } },
            available ? null : 'routing.rules.0.outboundTag'
        )
    }
    for (const naming of ['useHostRemarkAsTag', 'useHostTagAsTag']) {
        const config = {
            remnawave: { injectHosts: [pool('unused', { [naming]: true })] },
            routing: { rules: [{ outboundTag: 'host-derived-name' }] }
        }
        parity(config, null)
        for (const tag of ['', null, 42]) {
            config.routing.rules[0].outboundTag = tag
            parity(config, 'routing.rules.0.outboundTag')
        }
    }
})

test('real generated configurations agree for renamed GUI imports and equivalent hand-written code', async () => {
    const code = JSON.parse(imported())
    code.routing.balancers[0].fallbackTag = 'auto-2'
    const gui = JSON.parse(model.renamePoolPrefix(JSON.stringify(code), 0, 'new'))
    code.remnawave.injectHosts[0].tagPrefix = 'new'
    code.routing.rules[0].outboundTag = 'new'
    code.routing.balancers[0].selector = ['new']
    code.routing.balancers[0].fallbackTag = 'new-2'
    code.observatory.subjectSelector = ['new']
    const hosts = [0, 1, 2].map((n) => ({
        protocol: 'shadowsocks',
        protocolOptions: { password: 'fixture-only', method: 'aes-128-gcm' },
        address: `node${n}.example.test`,
        port: 443,
        transport: 'tcp',
        transportOptions: {},
        security: 'none',
        securityOptions: {},
        streamOverrides: {},
        mux: {},
        finalRemark: `host-${n}`,
        clientOverrides: { mapper: { xrayJson: null } },
        metadata: { uuid: id(n), tags: [], isHidden: n !== 0, excludeFromSubscriptionTypes: [] }
    }))
    const generate = async (config) =>
        JSON.parse(
            await new XrayJsonGeneratorService({
                getCachedTemplateByType: async () => config
            }).generateConfig({ hosts, isExtendedClient: false })
        )
    parity(gui, null)
    parity(code, null)
    const result = await generate(gui)
    assert.deepEqual(result, await generate(code))
    assert.equal(result.length, 1)
    for (const rule of result[0].routing.rules)
        if (rule.outboundTag)
            assert.ok(result[0].outbounds.some((outbound) => outbound.tag === rule.outboundTag))
    for (const balance of result[0].routing.balancers)
        if (balance.fallbackTag)
            assert.ok(result[0].outbounds.some((outbound) => outbound.tag === balance.fallbackTag))
    assert.deepEqual(
        result[0].outbounds
            .filter((outbound) => outbound.tag.startsWith('new'))
            .map((outbound) => outbound.settings.servers[0].address),
        ['node1.example.test', 'node2.example.test']
    )
})

test('pool rename transfers exact and numeric fallback references while preserving static and neighboring targets', () => {
    const input = {
        outbounds: ['direct', 'proxy', 'auto-1', 'auto-02'].map((tag) => ({
            tag,
            protocol: 'freedom'
        })),
        remnawave: { injectHosts: [pool(), pool('auto-eu')] },
        routing: {
            balancers: ['auto', 'auto-2', 'direct', 'proxy', 'auto-1', 'auto-02', 'auto-eu'].map(
                (fallbackTag, index) => ({
                    tag: `balance-${index}`,
                    selector: ['auto', 'auto-eu'],
                    fallbackTag,
                    strategy: { type: 'random' }
                })
            )
        }
    }
    const output = JSON.parse(model.renamePoolPrefix(JSON.stringify(input), 0, 'new'))
    assert.deepEqual(
        output.routing.balancers.map((balance) => balance.fallbackTag),
        ['new', 'new-2', 'direct', 'proxy', 'auto-1', 'auto-02', 'auto-eu']
    )
    assert.deepEqual(
        output.routing.balancers.map((balance) => balance.selector),
        input.routing.balancers.map(() => ['new', 'auto-eu'])
    )
    assert.deepEqual(output.outbounds, input.outbounds)
    parity(output, null)
})

test('fallback-only rename rejects ambiguous, empty and colliding targets without changing the draft', () => {
    const input = {
        outbounds: [{ tag: 'direct', protocol: 'freedom' }],
        remnawave: { injectHosts: [pool()] },
        routing: { balancers: [{ tag: 'balance', selector: ['auto'], fallbackTag: 'auto-2' }] }
    }
    for (const prefix of ['', 'direct']) {
        const fixture = structuredClone(input)
        fixture.routing.balancers[0].fallbackTag = 'auto'
        let draft = JSON.stringify(fixture),
            before = draft
        assert.throws(() => {
            draft = model.renamePoolPrefix(draft, 0, prefix)
        }, /routing\.balancers\.0\.fallbackTag/)
        assert.equal(draft, before)
    }
    input.remnawave.injectHosts.push(pool('unused', { useHostTagAsTag: true }))
    assert.throws(
        () => model.renamePoolPrefix(JSON.stringify(input), 0, 'new'),
        /routing\.balancers\.0\.fallbackTag/
    )
})

test('deletion preserves the draft for explicit numeric or unresolved fallback dependencies and cleans a removed balancer', () => {
    const numeric = {
        remnawave: { injectHosts: [pool(), pool('other')] },
        routing: {
            balancers: [{ tag: 'shared', selector: ['auto', 'other'], fallbackTag: 'auto-2' }]
        }
    }
    const exact = {
        remnawave: { injectHosts: [pool()] },
        routing: { balancers: [{ tag: 'manual', selector: ['unrelated'], fallbackTag: 'auto' }] }
    }
    for (const fixture of [numeric, exact]) {
        let draft = JSON.stringify(fixture),
            before = draft
        assert.throws(() => {
            draft = model.removePool(draft, 0)
        }, /routing\.balancers\.0\.fallbackTag/)
        assert.equal(draft, before)
    }
    const automatic = structuredClone(numeric)
    automatic.routing.balancers[0].fallbackTag = 'auto'
    const remaining = JSON.parse(model.removePool(JSON.stringify(automatic), 0))
    assert.equal(remaining.routing.balancers[0].fallbackTag, 'other')
    parity(remaining, null)
    const dedicated = structuredClone(numeric)
    dedicated.routing.balancers[0].selector = ['auto']
    const removed = JSON.parse(model.removePool(JSON.stringify(dedicated), 0))
    assert.equal(removed.routing?.balancers, undefined)
    parity(removed, null)
})

test('all balancer strategies validate fallback type and availability with backend-compatible dynamic exceptions', () => {
    const config = (fallbackTag) => ({
        outbounds: [{ tag: 'direct', protocol: 'freedom' }],
        remnawave: { injectHosts: [pool()] },
        routing: {
            balancers: [
                { tag: 'balance', selector: ['auto'], fallbackTag, strategy: { type: 'random' } }
            ]
        }
    })
    for (const strategy of ['random', 'roundRobin', 'leastPing', 'leastLoad', 'priority']) {
        for (const tag of [
            null,
            42,
            'missing',
            'DIRECT',
            'REJECT',
            'auto-1',
            'auto-02',
            'auto-other'
        ]) {
            const fixture = config(tag)
            fixture.routing.balancers[0].strategy.type = strategy
            parity(fixture, 'routing.balancers.0.fallbackTag')
        }
        for (const tag of [undefined, 'direct', 'auto', 'auto-2', 'auto-10']) {
            const fixture = config(tag)
            fixture.routing.balancers[0].strategy.type = strategy
            parity(fixture, null)
        }
        const empty = config('')
        empty.routing.balancers[0].strategy.type = strategy
        parity(empty, strategy === 'priority' ? 'routing.balancers.0.fallbackTag' : null)
    }
    for (const naming of ['useHostRemarkAsTag', 'useHostTagAsTag']) {
        const fixture = config('host-derived-name')
        fixture.remnawave.injectHosts[0][naming] = true
        parity(fixture, null)
        for (const tag of [null, 42]) {
            fixture.routing.balancers[0].fallbackTag = tag
            parity(fixture, 'routing.balancers.0.fallbackTag')
        }
        fixture.routing.balancers[0].fallbackTag = ''
        parity(fixture, null)
        fixture.routing.balancers[0].strategy.type = 'priority'
        parity(fixture, 'routing.balancers.0.fallbackTag')
    }
    const implicit = config('proxy')
    delete implicit.remnawave
    parity(implicit, null)
    const recipient = config('proxy')
    recipient.remnawave.addVirtualHostAsOutbound = true
    parity(recipient, null)
    parity(config('proxy'), 'routing.balancers.0.fallbackTag')
})

test('code-authored pool deletion surfaces the missing fallback path without changing the code', () => {
    const config = {
        remnawave: { injectHosts: [] },
        routing: { balancers: [{ tag: 'balance', selector: ['auto'], fallbackTag: 'auto-2' }] }
    }
    parity(config, 'routing.balancers.0.fallbackTag')
})

for (const language of ['en', 'ru', 'fa', 'zh'])
    test(`${language}: actual autoselect UI catches denied deletes, retains the draft and displays the precise path`, () => {
        const strings = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, `../public/locales/${language}/remnawave.json`),
                'utf8'
            )
        )
        const t = (key, parameters = {}) =>
            key.split('.').reduce((value, part) => value?.[part], strings) ??
            parameters.defaultValue ??
            key
        const fallback = {
            remnawave: { injectHosts: [pool(), pool('other')] },
            routing: {
                balancers: [{ tag: 'shared', selector: ['auto', 'other'], fallbackTag: 'auto-2' }]
            }
        }
        for (const [config, expected, wholeGroup] of [
            [JSON.parse(imported()), 'routing.rules.0.outboundTag', true],
            [fallback, 'routing.balancers.0.fallbackTag', false]
        ]) {
            const states = [],
                updates = []
            let stateIndex = 0
            const Accordion = Object.assign(() => {}, {
                Item: 'AccordionItem',
                Control: 'AccordionControl',
                Panel: 'AccordionPanel'
            })
            const components = [
                'Alert',
                'TagsInput',
                'Badge',
                'Button',
                'Group',
                'MultiSelect',
                'NumberInput',
                'Card',
                'Select',
                'Stack',
                'Switch',
                'Text',
                'TextInput',
                'Title'
            ]
            const mocks = {
                react: {
                    useState(initial) {
                        const index = stateIndex++
                        if (!(index in states))
                            states[index] = typeof initial === 'function' ? initial() : initial
                        return [
                            states[index],
                            (value) => {
                                states[index] =
                                    typeof value === 'function' ? value(states[index]) : value
                            }
                        ]
                    },
                    useMemo: (callback) => callback(),
                    useDeferredValue: (value) => value
                },
                '@mantine/core': {
                    ...Object.fromEntries(components.map((name) => [name, name])),
                    Accordion
                },
                'react-i18next': { useTranslation: () => ({ t }) },
                './autoselect-model': model,
                './autoselect-panel.module.css': {},
                './autoselect-sources': load(path.join(editor, 'autoselect-sources.ts')),
                './geofile-address-rules-panel': { GeofileAddressRules: 'ManualRules' },
                './priority-order': {},
                './template-assignment-panel': {},
                './template-changes': { TemplateChanges: 'TemplateChanges' }
            }
            const compiled = ts.transpileModule(
                fs.readFileSync(path.join(editor, 'autoselect-panel.tsx'), 'utf8'),
                {
                    compilerOptions: {
                        jsx: ts.JsxEmit.ReactJSX,
                        module: ts.ModuleKind.CommonJS,
                        esModuleInterop: true
                    }
                }
            ).outputText
            const ref = { exports: {} }
            new Function('require', 'module', 'exports', compiled)(
                (name) => (Object.hasOwn(mocks, name) ? mocks[name] : require(name)),
                ref,
                ref.exports
            )
            const text = JSON.stringify(config)
            const elements = (value) =>
                Array.isArray(value)
                    ? value.flatMap(elements)
                    : !value || typeof value !== 'object'
                      ? []
                      : [value, ...elements(value.props?.children)]
            const render = () => {
                stateIndex = 0
                return elements(
                    ref.exports.AutoselectPanel({
                        text,
                        baseline: text,
                        config,
                        hosts: [],
                        onChange: (value) => updates.push(value)
                    })
                )
            }
            const view = render()
            const poolCard = view.find(
                (element) => element.type?.name === 'PoolCard' && element.props.index === 0
            )
            const controls = wholeGroup ? view : elements(poolCard.type(poolCard.props))
            const remove = controls.find(
                (element) =>
                    element.type === 'Button' &&
                    element.props.children ===
                        t(wholeGroup ? 'autoselect.remove-selection' : 'autoselect.remove-pool')
            )
            assert(remove)
            assert.doesNotThrow(() => remove.props.onClick())
            assert.deepEqual(updates, [])
            const alert = render().find(
                (element) =>
                    element.type === 'Alert' && element.props.title === t('autoselect.edit-error')
            )
            assert(alert)
            assert(
                elements(alert).some(
                    (element) =>
                        element.type === 'Text' &&
                        element.props.children === expected &&
                        element.props.dir === 'ltr'
                )
            )
            assert(alert.props.children.includes(t('autoselect.structure-error')))
            assert.equal(JSON.stringify(config), text)
        }
    })

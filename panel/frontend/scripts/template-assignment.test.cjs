const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const load = require('../../backend/tests/load-typescript.cjs')
const root = path.join(__dirname, '../src/widgets/dashboard/templates/subscription-template-editor')
const { assignmentFor, setAssignment, bindLegacyAssignment } = load(path.join(root, 'template-assignment-model.ts'))

test('editing another selection leaves an unresolved legacy assignment in its original valid slot', () => {
    const { RemnawaveInjectorSchema } = require('@remnawave/backend-contract')
    const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
    const config = { routing: { balancers: [{ tag: 'one' }, { tag: 'two' }] }, remnawave: { assignTo: { hosts: [id(1)] } } }
    const next = JSON.parse(setAssignment(JSON.stringify(config), 'two', 'hosts', [id(2)]))
    assert.deepEqual(next.remnawave.assignTo, config.remnawave.assignTo)
    assert.deepEqual(next.remnawave.assignments, [{ balancerTag: 'two', hosts: [id(2)] }])
    assert.equal(RemnawaveInjectorSchema.safeParse(next.remnawave).success, true)
    const bound = JSON.parse(bindLegacyAssignment(JSON.stringify(next), 1, 'one'))
    assert.equal(bound.remnawave.assignTo, undefined)
    assert.deepEqual(bound.remnawave.assignments[1], { balancerTag: 'one', hosts: [id(1)] })
})

test('one legacy assignment is edited inside its only selection without losing settings', () => {
    const config = { custom: { keep: true }, routing: { balancers: [{ tag: 'auto' }] }, remnawave: { assignTo: { hosts: ['host-a'], tags: ['old'], future: 7 } } }
    assert.equal(assignmentFor(config, 'auto'), config.remnawave.assignTo)
    const next = JSON.parse(setAssignment(JSON.stringify(config), 'auto', 'tags', ['new', 'new']))
    assert.equal(next.remnawave.assignTo, undefined)
    assert.deepEqual(next.remnawave.assignments, [{ hosts: ['host-a'], tags: ['new'], future: 7, balancerTag: 'auto' }])
    assert.deepEqual(next.custom, config.custom)
    assert.deepEqual(config.remnawave.assignTo.tags, ['old'])
})

test('editing one selection preserves the other assignment and its precedence', () => {
    const config = { routing: { balancers: [{ tag: 'one' }, { tag: 'two' }] }, remnawave: { assignments: [{ balancerTag: 'one', hosts: ['a'] }, { balancerTag: 'two', tags: ['B'] }] } }
    let text = setAssignment(JSON.stringify(config), 'one', 'tags', ['A'])
    assert.deepEqual(JSON.parse(text).remnawave.assignments[1], config.remnawave.assignments[1])
    text = setAssignment(text, 'one', 'hosts', [])
    text = setAssignment(text, 'one', 'tags', [])
    assert.deepEqual(JSON.parse(text).remnawave.assignments, [config.remnawave.assignments[1]])
    assert.throws(() => setAssignment(text, 'missing', 'hosts', ['x']), /balancer-missing/)
})

test('ambiguous legacy assignments require a chosen target and preserve unrelated routing', () => {
    const config = { routing: { balancers: [{ tag: 'one' }, { tag: 'two' }], rules: [{ custom: true }] }, remnawave: { assignTo: { hosts: ['legacy'] }, assignments: [{ balancerTag: 'one', tags: ['A'] }] } }
    assert.equal(assignmentFor(config, 'two'), undefined)
    const next = JSON.parse(bindLegacyAssignment(JSON.stringify(config), 1, 'two'))
    assert.deepEqual(next.remnawave.assignments, [{ balancerTag: 'one', tags: ['A'] }, { hosts: ['legacy'], balancerTag: 'two' }])
    assert.deepEqual(next.routing, config.routing)
    assert.throws(() => bindLegacyAssignment(JSON.stringify(config), 0, 'two'), /assignment-target/)
})

test('explicit recovery merges a legacy or missing-target assignment without duplicating the balancer', () => {
    const config = { routing: { balancers: [{ tag: 'one' }] }, remnawave: { assignments: [{ balancerTag: 'one', hosts: ['a'], tags: ['A'] }, { balancerTag: 'removed', hosts: ['a', 'b'], tags: ['B'], future: true }] } }
    const next = JSON.parse(bindLegacyAssignment(JSON.stringify(config), 1, 'one'))
    assert.deepEqual(next.remnawave.assignments, [{ balancerTag: 'one', hosts: ['a', 'b'], tags: ['A', 'B'], future: true }])
    assert.throws(() => bindLegacyAssignment(JSON.stringify(config), 1, 'missing'), /assignment-target/)
})

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const exportsObject = {}
const file = path.join(__dirname, '../src/widgets/dashboard/nodes-statistic/statistic-barchart/nodes-usage-layout.ts')
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject })
const { createUsageRows, findUsageSegment } = exportsObject
const nodes = [
    { name: 'a', data: [10, 0, 30] },
    { name: 'b', data: [20, 40, 50] },
    { name: 'c', data: [NaN, -5, Infinity] }
]

test('newest day first, correct totals and half-open hit boundaries', () => {
    const { rows, max } = createUsageRows(3, nodes, new Set())
    assert.equal(rows[0].day, 2)
    assert.equal(rows[0].total, 80)
    assert.equal(max, 80)
    assert.equal(findUsageSegment(rows[0], 0).node, 0)
    assert.equal(findUsageSegment(rows[0], 29.99).node, 0)
    assert.equal(findUsageSegment(rows[0], 30).node, 1)
    assert.equal(findUsageSegment(rows[0], 80), undefined)
    assert.equal(findUsageSegment(rows[0], -1), undefined)
    assert.equal(findUsageSegment(undefined, 0), undefined)
})

test('hidden nodes rescale the graph and cannot appear in hit tests', () => {
    const { rows, max } = createUsageRows(3, nodes, new Set([0]))
    assert.equal(max, 50)
    assert.equal(rows[0].segments.length, 1)
    assert.equal(findUsageSegment(rows[0], 0).node, 1)
    const empty = createUsageRows(3, nodes, new Set([0, 1, 2]))
    assert.equal(empty.max, 1)
    assert.equal(empty.rows[0].total, 0)
    assert.equal(findUsageSegment(empty.rows[0], 0), undefined)
})

test('missing values, malformed numbers and large datasets remain bounded by days', () => {
    const missing = createUsageRows(3, [{ name: 'a', data: [1] }], new Set())
    assert.equal(missing.rows[0].total, 0)
    assert.equal(missing.rows[2].total, 1)
    const large = createUsageRows(180, Array.from({ length: 100 }, (_, n) => ({ name: String(n), data: Array(180).fill(n + 1) })), new Set())
    assert.equal(large.rows.length, 180)
    assert.equal(large.max, 5050)
    assert.equal(findUsageSegment(large.rows[179], 5049).node, 99)
})

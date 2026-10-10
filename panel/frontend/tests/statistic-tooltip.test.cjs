const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')
const ts = require('typescript')

function load(relative, imports = {}) {
    const exports = {}
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
    }).outputText, { exports, require: name => imports[name] ?? require(name) })
    return exports
}
const bytes = load('shared/utils/bytes/pretty-bytes/pretty-bytes.util.ts')
const time = load('shared/utils/time-utils/format-time.util.ts')
let dateCalls = 0
const { createNodesTooltipFormatter } = load('widgets/dashboard/nodes-statistic/statistic-barchart/statistic-tooltip.ts', {
    '@mantine/core': { alpha: (value, opacity) => `color-mix(in srgb, ${value} ${opacity * 100}%, transparent)` },
    '@shared/utils/bytes': bytes,
    '@shared/utils/time-utils': { formatTimeUtil: args => { dateCalls++; return time.formatTimeUtil(args) } }
})
const GiB = 1073741824
const dates = ['2026-10-01', '2026-10-02', '2026-10-03']
const nodes = [
    { name: 'One', color: '#123456', countryCode: 'RU', data: [GiB, 2 * GiB, 0] },
    { name: 'Two', color: '#654321', countryCode: 'RU', data: [3 * GiB, 5 * GiB, GiB] }
]
const point = (nodeIndex, index) => ({ index, series: { index: nodeIndex } })

test('tooltip totals include every node and the detail belongs to the selected node/day', () => {
    const format = createNodesTooltipFormatter(dates, nodes, 'en', 'Click for details')
    const html = format.call(point(0, 1))
    assert.match(html, /Σ 7\.00 GiB/)
    assert.match(html, />One<\/span>/)
    assert.match(html, />2\.00 GiB<\/span>/)
    assert.match(html, /2 October 2026/)
    assert.match(html, /Click for details/)
    assert.match(format.call(point(1, 1)), />Two<\/span>/)
})

test('dates are formatted once per dataset; repeated hover does not reformat dates or mutate inputs', () => {
    dateCalls = 0
    const snapshot = JSON.stringify(nodes)
    const format = createNodesTooltipFormatter(dates, nodes, 'en', 'Details')
    assert.equal(dateCalls, dates.length * 2)
    const html = format.call(point(0, 1))
    for (let i = 0; i < 100; i++) assert.equal(format.call(point(0, 1)), html)
    format.call(point(1, 0))
    assert.equal(dateCalls, dates.length * 2)
    assert.equal(JSON.stringify(nodes), snapshot)
})

test('a fresh dataset or language gets fresh totals, labels and dates', () => {
    require('dayjs/locale/ru')
    const updated = nodes.map(node => ({ ...node, data: node.data.map(value => value * 2) }))
    const en = createNodesTooltipFormatter(dates, nodes, 'en', 'Details').call(point(0, 1))
    const ru = createNodesTooltipFormatter(dates, updated, 'ru', 'Подробности').call(point(0, 1))
    assert.match(en, /Σ 7\.00 GiB/)
    assert.match(ru, /Σ 14\.00 GiB/)
    assert.match(ru, /2 октября 2026/)
    assert.match(ru, /Подробности/)
})

test('labels and hints are escaped before reaching the HTML renderer', () => {
    const format = createNodesTooltipFormatter(dates, [{ ...nodes[0], name: '<img src=x onerror="alert(1)"> & \'test\'' }], 'en', '<script>test</script>')
    const html = format.call(point(0, 0))
    assert.doesNotMatch(html, /<img|<script>/)
    assert.match(html, /&lt;img/)
    assert.match(html, /&quot;alert\(1\)&quot;/)
    assert.match(html, /&amp; &#39;test&#39;/)
})

test('empty data, missing points, zero traffic and the edge of a period are safe', () => {
    assert.equal(createNodesTooltipFormatter([], [], 'en', '').call(point(0, 0)), false)
    const format = createNodesTooltipFormatter(dates, nodes, 'en', '')
    assert.equal(format.call(point(0, -1)), false)
    assert.equal(format.call(point(0, 3)), false)
    assert.equal(format.call(point(2, 0)), false)
    const html = format.call(point(0, 2))
    assert.match(html, /Σ 1\.00 GiB/)
    assert.match(html, />0<\/span>/)
    assert.doesNotMatch(html, /NaN|Infinity|undefined/)
})

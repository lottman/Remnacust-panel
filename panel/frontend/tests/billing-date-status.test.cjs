const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { MantineProvider } = require('@mantine/core')
const i18next = require('i18next')

const root = path.join(__dirname, '../src/widgets/dashboard/infra-billing')
const locales = Object.fromEntries(['en', 'ru', 'fa', 'zh'].map(lang => [lang, {
    translation: require(`../public/locales/${lang}/remnawave.json`)
}]))
const i18n = i18next.createInstance()
i18n.init({ lng: 'ru', resources: locales, initImmediate: false })
function load(name, mocks = {}, globals = {}) {
    const exports = {}
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, name), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    }).outputText, { exports, require: key => mocks[key] ?? require(key), ...globals })
    return exports
}
const { getBillingDateStatus } = load('billing-date-status.ts')
const today = new Date('2026-10-20T23:59:59.999Z')

test('billing dates change state at UTC calendar boundaries, including today', () => {
    for (const [date, state, days] of [
        ['2026-10-28', 'normal', 8], ['2026-10-27', 'upcoming', 7],
        ['2026-10-22', 'upcoming', 2], ['2026-10-21', 'urgent', 1],
        ['2026-10-20T00:00:00Z', 'today', 0], ['2026-10-19T23:59:59Z', 'overdue', -1],
        ['2026-10-18', 'overdue', -2]
    ]) {
        const result = getBillingDateStatus(date, today)
        assert.equal(result.state, state, date)
        assert.equal(result.daysRemaining, days, date)
    }
    assert.equal(getBillingDateStatus('2026-10-20', new Date('2026-10-21T00:00:00Z')).state, 'overdue')
    assert.equal(getBillingDateStatus('2026-10-20', new Date('2026-10-20T03:00:00+03:00')).state, 'today')
})

test('UTC month, year, leap day and DST boundaries do not shift payment dates', () => {
    for (const [from, to] of [
        ['2026-12-31', '2027-01-01'], ['2028-02-28', '2028-02-29'],
        ['2028-02-29', '2028-03-01'], ['2026-03-08', '2026-03-09']
    ]) assert.equal(getBillingDateStatus(to, new Date(from)).daysRemaining, 1)
    for (const missing of [null, undefined, '', 'not-a-date', new Date(NaN)]) {
        assert.equal(getBillingDateStatus(missing, today).state, 'unknown')
    }
})

test('localized labels distinguish overdue from due today and include an editable date button', () => {
    const { BillingDateStatusRow } = load('billing-date-status-row.tsx', {
        './billing-date-status': { getBillingDateStatus },
        './billing-date-status.module.css': { statusColors: 'colors', statusRow: 'row', dateButton: 'date', badge: 'badge', badgeLabel: 'label' },
        'react-i18next': { useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }) },
        '@shared/utils/time-utils': { formatTimeUtil: ({ time }) => String(time) }
    })
    const render = (date, onEdit) => renderToStaticMarkup(React.createElement(MantineProvider, null,
        React.createElement(BillingDateStatusRow, { date, today, onEdit })))
    i18n.changeLanguage('ru')
    assert.match(render('2026-10-19', () => {}), /Просрочено на 1 день/)
    assert.match(render('2026-10-18'), /Просрочено на 2 дня/)
    assert.match(render('2026-10-15'), /Просрочено на 5 дней/)
    assert.match(render('2026-10-20'), /Оплата сегодня/)
    assert.match(render('2026-10-21'), /Оплата завтра/)
    assert.match(render('2026-10-27'), /Оплата через 7 дней/)
    assert.match(render('invalid'), /Дата оплаты не указана/)
    assert.match(render('2026-10-19', () => {}), /<button[^>]*aria-label="Изменить дату оплаты/)
    assert.doesNotMatch(render('2026-10-19'), /<button/)
    for (const language of ['en', 'ru', 'fa', 'zh']) {
        i18n.changeLanguage(language)
        const html = render('2026-10-19')
        assert.ok(html.includes('data-billing-state="overdue"'))
        assert.ok(!html.includes('billing-date-status.'))
    }
})

test('an open billing view refreshes at midnight and on return, and releases its timer', () => {
    let now = Date.parse('2026-10-20T23:59:59.999Z')
    let effect
    let timer
    const updates = []
    const listeners = new Map()
    const events = name => ({
        addEventListener: (event, fn) => listeners.set(`${name}:${event}`, fn),
        removeEventListener: event => listeners.delete(`${name}:${event}`)
    })
    class Clock extends Date { static now() { return now } }
    const { useBillingToday } = load('use-billing-today.ts', {
        react: {
            useState: initial => [initial(), value => updates.push(value)],
            useEffect: fn => { effect = fn }
        }
    }, {
        Date: Clock, window: events('window'), document: events('document'),
        setTimeout: (fn, delay) => { timer = { fn, delay }; return 1 },
        clearTimeout: () => { timer = null }
    })
    assert.equal(useBillingToday().toISOString(), '2026-10-20T00:00:00.000Z')
    const cleanup = effect()
    assert.equal(timer.delay, 51)
    now += 1
    timer.fn()
    assert.equal(updates.at(-1), Math.floor(now / 86400000))
    now += 86400000
    listeners.get('window:focus')()
    assert.equal(updates.at(-1), Math.floor(now / 86400000))
    cleanup()
    assert.equal(timer, null)
    assert.equal(listeners.size, 0)
})

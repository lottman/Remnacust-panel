const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const filename = path.join(__dirname, '../src/shared/ui/forms/users/forms-components/freeze-schedule-field.tsx')
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
}).outputText
const ref = { exports: {} }
const dependencies = {
    react: { useState: initialize => [initialize(), () => {}] },
    'react-i18next': { useTranslation: () => ({ t: key => key, i18n: { language: 'ru' } }) }
}
new Function('require', 'module', 'exports', compiled)(
    name => dependencies[name] ?? require(name), ref, ref.exports
)
const { FreezeScheduleField } = ref.exports

for (const zone of ['UTC', 'Europe/Moscow', 'America/New_York']) {
    test(`${zone}: a new freeze defaults to local current time rather than midnight`, () => {
        const previous = process.env.TZ
        try {
            process.env.TZ = zone
            const field = FreezeScheduleField({ value: null, onChange() {} })
            const now = field.props.minDate
            const hh = String(now.getHours()).padStart(2, '0')
            const mm = String(now.getMinutes()).padStart(2, '0')
            const ss = String(now.getSeconds()).padStart(2, '0')
            assert.equal(field.props.defaultTimeValue, `${hh}:${mm}:${ss}`)
            assert.equal(field.props.timePickerProps.format, '24h')
            assert.equal(field.props.timePickerProps.withDropdown, true)
        } finally {
            if (previous === undefined) delete process.env.TZ
            else process.env.TZ = previous
        }
    })

    test(`${zone}: selected hours and minutes survive local parsing, redraw and UTC serialization`, () => {
        const previous = process.env.TZ
        try {
            process.env.TZ = zone
            let selected
            const change = value => { selected = value }
            const field = FreezeScheduleField({ value: null, onChange: change })
            field.props.onChange('2090-11-20 18:37:00')
            assert.equal(selected.getHours(), 18)
            assert.equal(selected.getMinutes(), 37)
            const redrawn = FreezeScheduleField({ value: selected, onChange: change })
            assert.equal(redrawn.props.value, '2090-11-20 18:37:00')
            assert.equal(redrawn.props.defaultTimeValue, undefined)
            assert.equal(new Date(selected.toISOString()).getTime(), selected.getTime())
            redrawn.props.onChange(null)
            assert.equal(selected, null)
        } finally {
            if (previous === undefined) delete process.env.TZ
            else process.env.TZ = previous
        }
    })
}

test('saved freeze deadlines stay read-only with their selected local time', () => {
    const deadline = new Date('2090-11-20T15:37:00Z')
    const field = FreezeScheduleField({ value: deadline, readOnly: true, onChange() { throw new Error('saved schedule must not change') } })
    assert.equal(field.props.readOnly, true)
    assert.equal(field.props['data-freeze-schedule'], 'saved')
    assert.equal(field.props.value, new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short', calendar: 'gregory' }).format(deadline))
})

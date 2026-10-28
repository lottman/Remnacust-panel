const assert = require('node:assert/strict')
const test = require('node:test')
const path = require('node:path')
const load = require('../../backend/tests/load-typescript.cjs')
require('dayjs/locale/ru')
require('dayjs/locale/fa')
require('dayjs/locale/zh')
const { formatRemainingDurationUtil: format } = load(path.join(__dirname, '../src/shared/utils/time-utils/format-remaining-duration.util.ts'))

test('a frozen remainder is localized and independent of the current date', () => {
    const now = Date.now
    try {
        for (const at of ['2026-01-31T23:59:59Z', '2026-02-28T00:00:00Z']) {
            Date.now = () => Date.parse(at)
            assert.equal(format(2 * 86400000, 'en'), '2 days')
            assert.equal(format(2 * 86400000, 'ru'), '2 дня')
            assert.equal(format(2 * 86400000, 'fa'), '2 روز')
            assert.equal(format(2 * 86400000, 'zh'), '2 天')
        }
    } finally { Date.now = now }
})

test('negative and unavailable remainders never produce a future or invalid date', () => {
    const zero = format(0, 'en')
    for (const value of [-1, NaN, Infinity]) assert.equal(format(value, 'en'), zero)
})

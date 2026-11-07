const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { types } = require('pg');

for (const extension of ['js', 'mjs']) {
    const source = fs.readFileSync(
        path.join(__dirname, '../node_modules/@prisma/adapter-pg/dist/index.' + extension),
        'utf8',
    );
    const extract = (name) => source.match(new RegExp('function ' + name + '\\([^]*?\\n\\}'))[0];
    const helpers = new Function(
        'getTypeParser',
        'ScalarColumnType',
        extract('normalize_timestamptz') +
            '\n' +
            extract('normalize_timestamp') +
            '\n' +
            extract('formatDateTime') +
            '\nreturn {normalize_timestamptz,normalize_timestamp,formatDateTime};',
    )(types.getTypeParser, { TIMESTAMPTZ: 1184 });
    test(
        extension +
            ': timestamptz preserves the instant across offsets, DST and the no-reset sentinel',
        () => {
            for (const [input, expected] of [
                ['2026-01-07 12:00:00.123456+09', '2026-01-07T03:00:00.123Z'],
                ['2026-01-06 22:00:00-05', '2026-01-07T03:00:00.000Z'],
                ['2026-07-06 23:00:00-04', '2026-07-07T03:00:00.000Z'],
                ['2026-01-07 08:45:00+05:45', '2026-01-07T03:00:00.000Z'],
                ['10000-01-01 08:59:59+09', '9999-12-31T23:59:59.000Z'],
            ])
                assert.equal(helpers.normalize_timestamptz(input), expected);
        },
    );
    test(
        extension +
            ': Date parameters carry UTC and timestamp-without-zone keeps its UTC wall clock',
        () => {
            const date = new Date('2026-01-07T03:00:00.123Z');
            assert.equal(helpers.formatDateTime(date), '2026-01-07 03:00:00.123+00:00');
            assert.equal(
                new Date(helpers.normalize_timestamp('2026-01-07 03:00:00.123')).toISOString(),
                date.toISOString(),
            );
        },
    );
}

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { source } = require('./upstream-filter-fixture.cjs');
const { DashboardSnapshotCache } = load(
    path.join(__dirname, '../src/modules/system/dashboard-snapshot-cache.ts'),
);
const { ok, fail } = load(path.join(__dirname, '../src/common/types/result.type.ts'));
const { SystemService } = source('modules/system/system.service.ts', {
    './dashboard-snapshot-cache': { DashboardSnapshotCache },
    '@common/types': { ok, fail },
    '@contract/constants': { ERRORS: { INTERNAL_SERVER_ERROR: { message: 'Unavailable' } } },
    './models': {
        GetBandwidthStatsResponseModel: class {
            constructor(value) {
                Object.assign(this, value);
            }
        },
    },
});

test('concurrent dashboard visits execute each bandwidth-period comparison once per canonical timezone', async () => {
    const service = new SystemService({}, {}, {}, {}, {});
    const calls = [];
    const periods = [
        'getLastTwoDaysUsage',
        'getLastSevenDaysUsage',
        'getLast30DaysUsage',
        'getCalendarMonthUsage',
        'getCurrentYearUsage',
    ];
    for (const name of periods)
        service[name] = async (tz) => {
            calls.push([name, tz]);
            await new Promise((resolve) => setImmediate(resolve));
            return { current: '1 GB', previous: '0 B', difference: '1 GB' };
        };
    const requests = Array.from({ length: 60 }, (_, i) =>
        service.getBandwidthStats({ tz: i % 2 ? 'UTC' : 'Etc/UTC' }),
    );
    const results = await Promise.all(requests);
    assert(results.every((result) => result.isOk));
    assert.equal(calls.length, 5);
    assert.deepEqual(
        calls.map(([name]) => name),
        periods,
    );
    await service.getBandwidthStats({ tz: 'Europe/Moscow' });
    assert.equal(calls.length, 10);
    const invalid = await service.getBandwidthStats({ tz: 'not/a/timezone' });
    assert.equal(invalid.isOk, false);
    assert.equal(calls.length, 10);
});

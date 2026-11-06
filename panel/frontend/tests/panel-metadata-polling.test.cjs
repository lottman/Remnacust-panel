const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const load = require('../../backend/tests/load-typescript.cjs');

function hook(get) {
    const command = { TSQ_url: '/api/system/metadata', ResponseSchema: { parse: value => value } };
    const contract = Object.fromEntries(['GetBandwidthStatsCommand', 'GetHttpStatsCommand', 'GetMetadataCommand',
        'GetNodesMetricsCommand', 'GetNodesStatisticsCommand', 'GetRecapCommand', 'GetRemnawaveHealthCommand', 'GetStatsCommand']
        .map(name => [name, command]));
    return load(path.join(__dirname, '../src/shared/api/hooks/system/system.query.hooks.ts'), {
        '@remnawave/backend-contract': contract,
        '@tanstack/react-query': { keepPreviousData: value => value, useQuery: options => options },
        '@shared/api/axios': { instance: { get } },
        '@shared/utils/time-utils': { sToMs: value => value * 1000, getUserTimezoneUtil: () => 'UTC' },
        '../../tsq-helpers': { createGetQueryHook: () => {}, errorHandler: () => { throw new Error('background toast'); } },
    }).useGetRemnawaveMetadata;
}

test('metadata checks observe new builds and are disabled before authentication', () => {
    const useMetadata = hook(async () => {});
    assert.equal(useMetadata({ rQueryParams: { enabled: false } }).enabled, false);
    const options = useMetadata({ rQueryParams: { enabled: true } });
    assert.equal(options.refetchInterval, 45000);
    assert.equal(options.refetchIntervalInBackground, false);
    assert.equal(options.refetchOnWindowFocus, 'always');
    assert.equal(options.refetchOnReconnect, 'always');
    assert.equal(options.staleTime, 0);
    assert.equal(options.retry, false);
});

test('metadata checks revalidate the response and preserve request cancellation', async () => {
    const controller = new AbortController();
    const metadata = { version: '1.1.7.98' };
    const options = hook(async (url, config) => {
        assert.equal(url, '/api/system/metadata');
        assert.equal(config.signal, controller.signal);
        assert.equal(config.headers['Cache-Control'], 'no-cache');
        assert.equal(config.timeout, 8000);
        return { data: { response: metadata } };
    })();
    assert.deepEqual(await options.queryFn({ signal: controller.signal }), metadata);
});

test('background failures stay in query state without invoking toast error handling', async () => {
    const failure = new Error('temporarily unavailable');
    const options = hook(async () => { throw failure; })();
    await assert.rejects(options.queryFn({ signal: new AbortController().signal }), error => error === failure);
});

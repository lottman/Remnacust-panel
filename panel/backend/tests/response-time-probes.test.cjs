const assert = require('node:assert/strict');
const { test } = require('node:test');
const { source } = require('./upstream-filter-fixture.cjs');
const { ensureResponseTimeProbes: prepare } = source(
    'modules/subscription-template/generators/response-time-probes.ts',
);
const balance = (selector, type = 'leastPing') => ({
    tag: selector[0],
    selector,
    strategy: { type },
});
const base = () => ({
    outbounds: [{ tag: 'pool-1', protocol: 'freedom' }],
    routing: { balancers: [balance(['pool'])] },
});

test('JSON latency balancers get actual HTTP checks without mutating the stored template', () => {
    const input = base();
    const original = structuredClone(input);
    const result = prepare(input);
    assert.deepEqual(input, original);
    assert.deepEqual(result.observatory, {
        subjectSelector: ['pool'],
        probeUrl: 'https://www.gstatic.com/generate_204',
        probeInterval: '30s',
        enableConcurrency: true,
    });
    assert.equal(result.outbounds, input.outbounds);
    assert.deepEqual(prepare(result), result);
});

test('every latency pool is covered and custom probes and unrelated rules remain unchanged', () => {
    const input = {
        ...base(),
        observatory: {
            subjectSelector: ['pool', 'manual'],
            probeURL: 'https://allowed.example/probe',
            probeInterval: '2m',
            enableConcurrency: false,
        },
    };
    input.routing.balancers.push(balance(['pool-2', 'other']), balance(['random'], 'random'));
    const result = prepare(input);
    assert.deepEqual(result.observatory.subjectSelector, ['pool', 'manual', 'other']);
    assert.equal(result.observatory.probeURL, input.observatory.probeURL);
    assert.equal(result.observatory.probeUrl, undefined);
    assert.equal(result.observatory.probeInterval, '2m');
    assert.equal(result.observatory.enableConcurrency, false);
    assert.equal(result.routing, input.routing);
});

test('existing burst probes use HEAD by default and preserve an explicit HTTP method', () => {
    for (const method of [undefined, 'GET']) {
        const input = {
            ...base(),
            burstObservatory: {
                pingConfig: {
                    destination: 'https://allowed.example/204',
                    interval: '1m',
                    sampling: 4,
                    ...(method ? { httpMethod: method } : {}),
                },
            },
        };
        const result = prepare(input);
        assert.equal(result.observatory, undefined);
        assert.deepEqual(result.burstObservatory.subjectSelector, ['pool']);
        assert.equal(result.burstObservatory.pingConfig.httpMethod, method ?? 'HEAD');
        assert.equal(
            result.burstObservatory.pingConfig.destination,
            input.burstObservatory.pingConfig.destination,
        );
        assert.equal(result.burstObservatory.pingConfig.interval, '1m');
        assert.equal(result.burstObservatory.pingConfig.sampling, 4);
    }
});

test('unrelated strategies do not enable extra network probes', () => {
    for (const type of ['random', 'roundRobin', 'priority']) {
        const input = { routing: { balancers: [balance(['pool'], type)] } };
        assert.equal(prepare(input), input);
    }
});

test('round robin and random fallback dependencies get HTTP observations without changing the strategy', () => {
    for (const type of ['roundRobin', 'random', 'leastLoad']) {
        const input = {
            routing: { balancers: [{ ...balance(['pool'], type), fallbackTag: 'pool' }] },
        };
        const saved = structuredClone(input);
        const output = prepare(input);
        assert.deepEqual(output.observatory.subjectSelector, ['pool']);
        assert.equal(output.routing.balancers[0].strategy.type, type);
        assert.equal(output.routing.balancers[0].fallbackTag, 'pool');
        assert.deepEqual(input, saved);
        assert.deepEqual(prepare(output), output);
    }
    const leastLoad = { routing: { balancers: [balance(['load'], 'leastLoad')] } };
    assert.deepEqual(prepare(leastLoad).observatory.subjectSelector, ['load']);
    for (const fallbackTag of [undefined, '']) {
        const input = {
            routing: { balancers: [{ ...balance(['pool'], 'roundRobin'), fallbackTag }] },
        };
        assert.equal(prepare(input), input);
    }
});

test('malformed configured observers do not silently turn into an unmeasured route', () => {
    for (const observer of [
        null,
        [],
        'invalid',
        { subjectSelector: 'pool' },
        { subjectSelector: [12] },
    ])
        assert.throws(() => prepare({ ...base(), observatory: observer }), /autoselect-observer/);
    assert.throws(
        () => prepare({ ...base(), burstObservatory: { pingConfig: [] } }),
        /autoselect-probe-settings/,
    );
});

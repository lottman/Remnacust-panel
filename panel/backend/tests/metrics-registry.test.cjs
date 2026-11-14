const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
require('reflect-metadata');
const { Counter, Gauge, register } = require('@prometheus-io/client');
const { PrometheusController } = require('@willsoto/nestjs-prometheus');
const load = require('./load-typescript.cjs');

const { METRIC_NAMES } = load(
    path.join(__dirname, '../libs/contract/constants/metrics/metric-names.constant.ts'),
);
const { METRIC_PROVIDERS } = load(path.join(__dirname, '../src/scheduler/metrics-providers.ts'), {
    '@libs/contracts/constants': { METRIC_NAMES },
});

test('scheduler providers share the maintained registry used by the metrics endpoint', async () => {
    register.clear();
    try {
        for (const provider of METRIC_PROVIDERS) {
            provider.useFactory({ customMetricPrefix: 'remnawave' });
        }
        const gaugeName = `remnawave_${METRIC_NAMES.NODE_ONLINE_USERS}`;
        const counterName = `remnawave_${METRIC_NAMES.NODE_INBOUND_UPLOAD_BYTES}`;
        const gauge = register.getSingleMetric(gaugeName);
        const counter = register.getSingleMetric(counterName);
        assert.ok(gauge instanceof Gauge);
        assert.ok(counter instanceof Counter);
        gauge.set({ node_uuid: 'fixture-node' }, 4);
        counter.inc({ node_uuid: 'fixture-node', tag: 'fixture-inbound' }, 37);
        const headers = {};
        const output = await new PrometheusController().index({
            header: (name, value) => {
                headers[name] = value;
            },
        });
        assert.equal(headers['Content-Type'], register.contentType);
        assert.ok(output.includes(`${gaugeName}{node_uuid="fixture-node"} 4`));
        assert.ok(
            output.includes(`${counterName}{node_uuid="fixture-node",tag="fixture-inbound"} 37`),
        );
    } finally {
        register.clear();
    }
});

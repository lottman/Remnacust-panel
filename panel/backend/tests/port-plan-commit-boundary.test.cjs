const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const model = load(path.join(__dirname, '../src/modules/nodes/profile-port-plan.ts'));
const { NodePortPlansService, PortPlanEditError } = load(path.join(__dirname, '../src/modules/nodes/node-port-plans.service.ts'), {
    '@common/database': {},
    '@common/raw-cache': {},
    '@common/axios/profile-traffic.schema': load(path.join(__dirname, '../src/common/axios/profile-traffic.schema.ts')),
    '@common/helpers/xray-config/xray-config.validator': {},
    './profile-port-plan': model,
    './port-plan-dispatch.service': {},
});
const node = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const request = { enabled: false, expectedRevision: '1', profileUuid: node, activeInbounds: [node] };

test('save and retry cannot enqueue work from an ambient uncommitted transaction', async () => {
    let calls = 0;
    const service = new NodePortPlansService({}, {
        isTransactionActive: () => true,
        withTransaction: async () => { calls++; },
    }, { dispatch: async () => { calls++; } });
    for (const operation of [() => service.save(node, request), () => service.retry(node, '1')]) {
        await assert.rejects(operation(), /requires its own commit boundary/);
    }
    assert.equal(calls, 0);
});

test('save and retry map real serialization and deadlock error forms to a revision conflict', async () => {
    for (const failure of [{ code: 'P2034' }, { code: 'P2010', meta: { code: '40001' } }, { code: 'P2010', meta: { code: '40P01' } }]) {
        let queued = false;
        const service = new NodePortPlansService({}, {
            isTransactionActive: () => false,
            withTransaction: async () => { throw failure; },
        }, { dispatch: async () => { queued = true; } });
        for (const operation of [() => service.save(node, request), () => service.retry(node, '1')]) {
            await assert.rejects(operation(), error => error instanceof PortPlanEditError && error.code === 'STALE_REVISION');
        }
        assert.equal(queued, false);
    }
});

test('unexpected transaction failures keep their identity and do not enqueue work', async () => {
    for (const failure of [new Error('database unavailable'), null]) {
        let queued = false;
        const service = new NodePortPlansService({}, {
            isTransactionActive: () => false,
            withTransaction: async () => { throw failure; },
        }, { dispatch: async () => { queued = true; } });
        for (const operation of [() => service.save(node, request), () => service.retry(node, '1')]) {
            await assert.rejects(operation(), error => error === failure);
        }
        assert.equal(queued, false);
    }
});

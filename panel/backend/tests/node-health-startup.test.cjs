const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { NodeHealthCheckTask } = load(
    path.join(__dirname, '../src/scheduler/enqueue/node-health-check/node-health-check.task.ts'),
    {
        '@modules/nodes/queries/get-enabled-nodes-partial/get-enabled-nodes-partial.query': {
            GetEnabledNodesPartialQuery: class {},
        },
        '@queue/_nodes': {},
        '../../intervals': { JOBS_INTERVALS: { NODE_HEALTH_CHECK: '*/10 * * * * *' } },
    },
);

function fixture() {
    const starts = [],
        checks = [],
        nodes = [{ uuid: 'test-node' }];
    const queues = {
        startAllNodes: async (payload) => starts.push(payload),
        checkNodeHealthBulk: async (payload) => checks.push(payload),
    };
    const task = new NodeHealthCheckTask(
        { execute: async () => ({ isOk: true, response: nodes }) },
        queues,
    );
    return { task, queues, starts, checks, nodes };
}

test('the initial start-all enqueue does not postpone health discovery for another poll interval', async () => {
    const f = fixture();
    await f.task.handleCron();
    assert.deepEqual(f.starts, [{ emitter: 'nodeHealthCheck' }]);
    assert.deepEqual(f.checks, [f.nodes]);
    await f.task.handleCron();
    assert.equal(f.starts.length, 1);
    assert.deepEqual(f.checks, [f.nodes, f.nodes]);
});

test('failed startup queue acceptance is retried on the next poll', async () => {
    const f = fixture();
    let calls = 0;
    f.queues.startAllNodes = async (payload) => {
        if (++calls === 1) throw new Error('Redis unavailable');
        f.starts.push(payload);
    };
    await f.task.handleCron();
    assert.deepEqual(f.starts, []);
    await f.task.handleCron();
    assert.equal(calls, 2);
    assert.equal(f.starts.length, 1);
    assert.deepEqual(f.checks, [f.nodes]);
});

test('health queue failure does not repeat an already accepted initial start-all', async () => {
    const f = fixture();
    let checks = 0;
    f.queues.checkNodeHealthBulk = async () => {
        if (++checks === 1) throw new Error('Health queue unavailable');
    };
    await f.task.handleCron();
    await f.task.handleCron();
    assert.equal(checks, 2);
    assert.equal(f.starts.length, 1);
});

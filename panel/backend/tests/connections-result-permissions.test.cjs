const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');

const constants = load(path.join(__dirname, '../src/queue/_nodes/constants/nodes-job-name.constant.ts'));
const { NODES_JOB_NAMES } = constants;
const { NodesQueuesService } = load(path.join(__dirname, '../src/queue/_nodes/nodes-queues.service.ts'), {
    '@queue/queue.enum': { QUEUES_NAMES: { NODES: {} } },
    './constants/nodes-job-name.constant': constants,
});

const readers = [
    ['connectionsByUserResult', NODES_JOB_NAMES.CONNECTIONS_BY_USER],
    ['connectionsByNodeResult', NODES_JOB_NAMES.CONNECTIONS_BY_NODE],
    ['geocheckByNodeResult', NODES_JOB_NAMES.GEOCHECK_BY_NODE],
];

function serviceWithJob(job) {
    const service = Object.create(NodesQueuesService.prototype);
    service.queryNodesQueue = { getJob: async id => {
        assert.equal(id, '123');
        return job;
    } };
    return service;
}

test('result scopes cannot expose jobs belonging to a different operation in the shared queue', async () => {
    for (const [reader, expectedName] of readers) {
        for (const name of Object.values(NODES_JOB_NAMES).filter(name => name !== expectedName)) {
            const service = serviceWithJob({
                name,
                getState: async () => assert.fail('must reject the job type before reading its state'),
                get returnvalue() { return assert.fail('must not read another operation result'); },
            });
            assert.equal(await service[reader]('123'), null, `${reader} must reject ${name}`);
        }
    }
});

test('matching jobs retain completed, pending, failed and missing result behavior', async () => {
    for (const [reader, name] of readers) {
        for (const state of ['completed', 'waiting', 'failed']) {
            const result = { success: true };
            const service = serviceWithJob({ name, returnvalue: result, progress: 0, getState: async () => state });
            const response = await service[reader]('123');
            assert.equal(response.isCompleted, state === 'completed');
            assert.equal(response.isFailed, state === 'failed');
            assert.equal(response.result, state === 'completed' ? result : null);
        }
        assert.equal(await serviceWithJob(null)[reader]('123'), null);
    }
});

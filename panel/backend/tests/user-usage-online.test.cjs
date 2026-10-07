const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const { test } = require('node:test');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '..');
const filename = path.join(root, 'src/queue/_nodes/processors/record-user-usage.processor.ts');
const mocks = {};
const ast = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
for (const node of ast.statements) {
    if (ts.isImportDeclaration(node)) mocks[node.moduleSpecifier.text] = {};
}
mocks['@nestjs/bullmq'] = { Processor: () => (value) => value, WorkerHost: class {} };
mocks['@queue/queue.enum'] = { QUEUES_NAMES: { NODES: { RECORD_USER_USAGE: 'usage' } } };
mocks['../constants/nodes-job-name.constant'] = { NODES_JOB_NAMES: { RECORD_USER_USAGE: 'usage' } };
mocks['@common/utils/device-identity'] = load(path.join(root, 'src/common/utils/device-identity.ts'));
mocks['@common/utils/nano'] = load(path.join(root, 'src/common/utils/nano/nano.util.ts'));
mocks['@libs/contracts/constants'] = {
    CACHE_KEYS: { NODE_USERS_ONLINE: (id) => `online:${id}` },
    CACHE_KEYS_TTL: { NODE_USERS_ONLINE: 30 },
    INTERNAL_CACHE_KEYS: { NODE_USER_USAGE: (id) => `usage:${id}` },
    INTERNAL_CACHE_KEYS_TTL: { NODE_USER_USAGE: 60 },
};
const Processor = load(filename, mocks).RecordUserUsageQueueProcessor;
function fixture(threshold = 0n) {
    const calls = { online: [], usage: [], redis: [] };
    const processor = Object.create(Processor.prototype);
    const pipeline = { hincrby: (...args) => calls.redis.push(args), expire() {}, async exec() {} };
    Object.assign(processor, {
        hostUsage:{record:async()=>{}},
        ignoreBelowBytes: threshold,
        logger: { error(error) { throw new Error(error); }, warn() {} },
        rawCacheService: { createPipeline: () => pipeline, set: async (...args) => {if(args[0].startsWith('online:'))calls.online.push(args)} },
        usersQueuesService: { updateUserUsage: async (rows) => calls.usage.push(...rows) },
        pushFromRedisQueueService: { recordUserUsageDelayed: async () => {} },
    });
    return { processor, calls };
}
const row = (username, downlink, uplink = 0) => ({ username, downlink, uplink });

test('fractional billing preserves byte precision above the Number safe range', () => {
    const { multiplyConsumption } = mocks['@common/utils/nano'];
    assert.equal(multiplyConsumption('1500000000', 9007199254740993n), 13510798882111489n);
    assert.equal(multiplyConsumption('500000000', 101), 50n);
});

test('shared and device keys count once, while all bytes are billed once', async () => {
    const { processor, calls } = fixture(100n);
    await processor.handleOk('node', 1n, { users: [
        row('42', 40), row('42~' + 'a'.repeat(24), 30, 40),
        row('42~' + 'b'.repeat(24), 70), row('77', 9),
        row('88', 0), row('99', -10, 20), row('not-a-user', 9000),
    ] }, '1000000000');
    assert.equal(calls.online[0][1], 2);
    assert.deepEqual(calls.usage, [{ u: '42', b: '180', n: 'node' }]);
    assert.deepEqual(calls.redis, [['usage:1', '42', '180'], ['usage:1', '77', '9']]);
});

test('zero billing multiplier does not hide active users or raw per-node usage', async () => {
    const { processor, calls } = fixture();
    await processor.handleOk('node', 1n, { users: [row('42', 100)] }, '0');
    assert.equal(calls.online[0][1], 1);
    assert.equal(calls.usage[0].b, '0');
    assert.equal(calls.redis[0][2], '100');
});

test('empty and zero-only polls reset online to zero', async () => {
    for (const users of [[], [row('42', 0)], [row('invalid', 100)]]) {
        const { processor, calls } = fixture();
        await processor.handleOk('node', 1n, { users }, '1000000000');
        assert.equal(calls.online[0][1], 0);
        assert.deepEqual(calls.usage, []);
    }
});

test('unreachable node clears cached online', async () => {
    const { processor, calls } = fixture();
    processor.logger.error = () => {};
    processor.axios = { getUsersStats: async () => ({ isOk: false }) };
    await processor.process({ data: { nodeUuid: 'node', nodeId: '1', connectionOpts: {} } });
    assert.equal(calls.online[0][1], 0);
});

test('host keys do not multiply online or billed traffic',async()=>{
 const {processor,calls}=fixture();
 await processor.handleOk('node',1n,{users:[
  row('42~'+'a'.repeat(24)+'~h'+'1'.repeat(32),100),
  row('42~'+'b'.repeat(24)+'~h'+'2'.repeat(32),200),
  row('43~'+'c'.repeat(24)+'~h'+'1'.repeat(32),300),
 ]},'1000000000');
 assert.equal(calls.online[0][1],2);
 assert.deepEqual(calls.usage,[{u:'42',b:'300',n:'node'},{u:'43',b:'300',n:'node'}]);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { deviceCredentials, usageOwner } = load(
    path.join(__dirname, '../src/common/utils/device-identity.ts'),
);
const { UserAccessDeliveryService } = load(
    path.join(__dirname, '../src/queue/_nodes/user-access-delivery.service.ts'),
    {
        '@common/axios': {},
        '@common/config/app-config': {},
        '@common/database': {},
        '@common/utils/device-identity': { deviceCredentials, usageOwner },
        '@common/utils/xera-crypto': { decryptSecret: (key) => key },
        '@modules/nodes/queries/get-node-by-uuid': {
            GetNodeByUuidQuery: class {
                constructor(uuid) {
                    this.uuid = uuid;
                }
            },
        },
        '@modules/users/queries/get-users-with-resolved-inbounds': {
            GetUsersWithResolvedInboundsQuery: class {
                constructor(tIds) {
                    this.tIds = tIds;
                }
            },
        },
        './port-plan-lease.service': {},
    },
);
const node = { uuid: 'node', address: 'test.invalid', port: 2222, proxyUrl: null };
const entry = { username: '1', hashUuid: 'key', tags: ['main'] };
const ack = { isOk: true, response: { success: true } };
function fixture() {
    let rows = [
            {
                id: 1n,
                status: 'ACTIVE',
                expiry: new Date('2099-01-01'),
                updated: new Date('2026-01-01'),
                key: 'key',
            },
        ],
        devices = [],
        active = 0,
        peak = 0,
        gate = Promise.resolve();
    const pending = [],
        sent = [],
        removed = [],
        queries = [];
    const service = new UserAccessDeliveryService(
        {},
        {
            execute: async (query) => {
                queries.push(query);
                if (query.uuid)
                    return {
                        isOk: true,
                        response: {
                            ...node,
                            isDisabled: false,
                            activeConfigProfileUuid: 'profile',
                            activeInbounds: [{ uuid: 'main', tag: 'main' }],
                        },
                    };
                return {
                    isOk: true,
                    response: rows
                        .filter((r) => query.tIds.includes(r.id))
                        .map((r) => ({
                            id: r.id,
                            inbounds: r.status === 'ACTIVE' ? [{ uuid: 'main', tag: 'main' }] : [],
                        })),
                };
            },
        },
        { getOrThrow: () => 'fixture-secret' },
        {
            withLifecycle: async (uuid, work) => {
                assert.equal(uuid, node.uuid);
                const before = gate;
                let release;
                gate = new Promise((r) => (release = r));
                await before;
                peak = Math.max(peak, ++active);
                try {
                    return await work(async () => {});
                } finally {
                    active--;
                    release();
                }
            },
        },
        {
            deleteUsers: async (data) => {
                removed.push(data);
                return ack;
            },
        },
    );
    service.snapshot = async () => structuredClone({ users: rows, devices });
    service.pending = async (ids) => pending.push(ids);
    const send = async (accepted) => {
        sent.push([...accepted]);
        return ack;
    };
    return {
        service,
        pending,
        sent,
        removed,
        queries,
        send,
        get rows() {
            return rows;
        },
        set rows(value) {
            rows = value;
        },
        set devices(value) {
            devices = value;
        },
        get peak() {
            return peak;
        },
    };
}
test('current shared grant is acknowledged, while an old freeze revoke is skipped', async () => {
    const f = fixture();
    await f.service.deliver(node, [entry], true, f.send);
    await f.service.deliver(node, [entry], false, f.send);
    assert.deepEqual(f.sent, [['1']]);
    assert.deepEqual(f.pending, [[1n]]);
});
test('old grant after freezing is skipped; current revoke is sent', async () => {
    const f = fixture();
    f.rows[0].status = 'FROZEN';
    await f.service.deliver(node, [entry], true, f.send);
    await f.service.deliver(node, [entry], false, f.send);
    assert.deepEqual(f.sent, [['1']]);
    assert.deepEqual(f.pending, [[1n]]);
});
test('old rotated grant is skipped but old-key revocation remains valid', async () => {
    const f = fixture();
    f.rows[0].key = 'rotated';
    await f.service.deliver(node, [entry], true, f.send);
    await f.service.deliver(node, [entry], false, f.send);
    assert.equal(f.sent.length, 1);
});
test('missing users cannot be granted; deletion revocation remains deliverable', async () => {
    const f = fixture();
    f.rows = [];
    await f.service.deliver(node, [entry], true, f.send);
    await f.service.deliver(node, [entry], false, f.send);
    assert.equal(f.sent.length, 1);
    assert.equal(f.pending.length, 0);
});
test('changed membership rejects old inbound tags and requests current access', async () => {
    const f = fixture();
    await f.service.deliver(node, [{ ...entry, tags: ['removed'] }], true, f.send);
    assert.equal(f.sent.length, 0);
    assert.deepEqual(f.pending, [[1n]]);
});
test('a grant already in flight at freeze completion durably requests correction', async () => {
    const f = fixture();
    await f.service.deliver(node, [entry], true, async () => {
        f.rows[0].status = 'FROZEN';
        return ack;
    });
    assert.deepEqual(f.pending, [[1n]]);
});
test('an old revoke in flight during resume requests current access and serializes sends', async () => {
    const f = fixture();
    f.rows[0].status = 'FROZEN';
    let entered, release;
    const started = new Promise((r) => (entered = r)),
        blocked = new Promise((r) => (release = r));
    const old = f.service.deliver(node, [entry], false, async () => {
        entered();
        await blocked;
        return ack;
    });
    await started;
    f.rows[0].status = 'ACTIVE';
    const fresh = f.service.deliver(node, [entry], true, f.send);
    release();
    await Promise.all([old, fresh]);
    assert.deepEqual(f.pending, [[1n]]);
    assert.deepEqual(f.sent, [['1']]);
    assert.equal(f.peak, 1);
});
test('all negative acknowledgements and transport errors reject and retain intent', async () => {
    for (const result of [
        { isOk: false },
        { isOk: true, response: { success: false } },
        { isOk: true, response: {} },
        null,
        'throw',
    ]) {
        const f = fixture();
        await assert.rejects(
            f.service.deliver(node, [entry], true, async () => {
                if (result === 'throw') throw Error('private upstream detail');
                return result;
            }),
            /User access delivery is pending/,
        );
        assert.deepEqual(f.pending, [[1n]]);
    }
});
test('intermediate Bull retries do not create a parallel outbox retry storm', async () => {
    const f = fixture();
    await assert.rejects(
        f.service.deliver(node, [entry], true, async () => ({ isOk: false }), false),
    );
    assert.equal(f.pending.length, 0);
});

test('unconfigured Node 503 remains retryable and a retried grant rechecks current permissions', async () => {
    const f = fixture();
    let sends = 0;
    await assert.rejects(
        f.service.deliver(
            node,
            [entry],
            true,
            async () => {
                sends++;
                return {
                    isOk: false,
                    code: 'NODE_HTTP_503',
                    message: 'Node user state is not synchronized',
                };
            },
            false,
        ),
        /User access delivery is pending/,
    );
    assert.equal(sends, 1);
    assert.deepEqual(f.pending, []);
    f.rows[0].status = 'FROZEN';
    await f.service.deliver(node, [entry], true, f.send, false);
    assert.deepEqual(f.sent, []);
    assert.deepEqual(f.pending, [[1n]]);
});

test('unconfigured Node on the last grant or revoke attempt persists access reconciliation', async () => {
    for (const adding of [true, false]) {
        const f = fixture();
        if (!adding) f.rows[0].status = 'FROZEN';
        await assert.rejects(
            f.service.deliver(node, [entry], adding, async () => ({
                isOk: false,
                code: 'NODE_HTTP_503',
            })),
            /User access delivery is pending/,
        );
        assert.deepEqual(f.pending, [[1n]]);
    }
});
test('deletion during an acknowledged grant revokes only the exact sent credentials', async () => {
    const f = fixture();
    await f.service.deliver(node, [entry], true, async () => {
        f.rows = [];
        return ack;
    });
    assert.deepEqual(f.removed, [{ users: [{ userId: '1', hashUuid: 'key' }] }]);
});

test('failed cleanup after deletion is retried even when the next ADD has no owner row', async () => {
    const f = fixture();
    let calls = 0;
    f.service.axios.deleteUsers = async (data) => {
        f.removed.push(data);
        if (++calls === 1) return { isOk: false };
        return ack;
    };
    await assert.rejects(
        f.service.deliver(node, [entry], true, async () => {
            f.rows = [];
            return ack;
        }),
        /delivery is pending/,
    );
    await f.service.deliver(node, [entry], true, f.send);
    assert.equal(calls, 2);
    assert.equal(f.sent.length, 0);
    assert.deepEqual(f.removed[1], { users: [{ userId: '1', hashUuid: 'key' }] });
});
test('blocked personal and shared credentials are rejected, valid personal identity is retained', async () => {
    const f = fixture(),
        device = { userId: 1n, hwid: 'device123456', blocked: false, updated: new Date() };
    f.devices = [device];
    const identity = deviceCredentials('fixture-secret', 1n, device.hwid, 'key');
    const personal = { ...entry, username: identity.username, hashUuid: identity.vlessUuid };
    await f.service.deliver(node, [personal], true, f.send);
    device.blocked = true;
    await f.service.deliver(node, [personal, entry], true, f.send);
    assert.deepEqual(f.sent, [[identity.username]]);
    assert.deepEqual(f.pending, [[1n]]);
});
test('bulk access resolution is batched and rejects only stale entries', async () => {
    const f = fixture();
    f.rows.push({ ...f.rows[0], id: 2n, status: 'FROZEN' });
    await f.service.deliver(node, [entry, { ...entry, username: '2' }], true, f.send);
    assert.deepEqual(f.sent, [['1']]);
    assert.equal(f.queries.filter((q) => q.tIds).length, 1);
    assert.deepEqual(f.pending, [[2n]]);
});
test('invalid identity or missing node UUID cannot cause network operations', async () => {
    const f = fixture();
    for (const [target, items] of [
        [{ ...node, uuid: undefined }, [entry]],
        [node, [{ ...entry, username: 'invalid' }]],
        [node, [{ ...entry, username: '99999999999999999999' }]],
    ])
        await assert.rejects(f.service.deliver(target, items, true, f.send));
    assert.equal(f.sent.length, 0);
});

for (const bulk of [false, true]) {
    const relative = bulk ? 'node-bulk-users.processor.ts' : 'node-users.processor.ts';
    const name = bulk ? 'NodeBulkUsersQueueProcessor' : 'NodeUsersQueueProcessor';
    const Worker = load(path.join(__dirname, '../src/queue/_nodes/processors', relative), {
        '@common/axios': {},
        '@queue/queue.enum': { QUEUES_NAMES: { NODES: { USERS: 'test', BULK_USERS: 'bulk' } } },
        '../constants/nodes-job-name.constant': {
            NODES_JOB_NAMES: {
                ADD_USER_TO_NODE: 'add',
                REMOVE_USER_FROM_NODE: 'remove',
                ADD_USERS_TO_NODE: 'addBulk',
                REMOVE_USERS_FROM_NODE: 'removeBulk',
            },
        },
        '../user-access-delivery.service': {},
    })[name];
    for (const adding of [false, true])
        for (const unavailable of [false, true])
            test(`${bulk ? 'bulk' : 'single'} ${adding ? 'grant' : 'revoke'} worker rejects ${unavailable ? '503' : 'negative acknowledgement'} and preserves retries`, async () => {
                const f = fixture();
                if (!adding) f.rows[0].status = 'FROZEN';
                const wire = bulk
                    ? adding
                        ? {
                              affectedInboundTags: ['main'],
                              users: [
                                  {
                                      userData: { userId: '1', hashUuid: 'key' },
                                      inboundData: [{ tag: 'main' }],
                                  },
                              ],
                          }
                        : { users: [{ userId: '1', hashUuid: 'key' }] }
                    : adding
                      ? { hashData: { vlessUuid: 'key' }, data: [{ username: '1', tag: 'main' }] }
                      : { username: '1', hashData: { vlessUuid: 'key' } };
                const axios = {
                    addUser: async () => ({
                        isOk: false,
                        code: unavailable ? 'NODE_HTTP_503' : undefined,
                    }),
                    deleteUser: async () => ({
                        isOk: false,
                        code: unavailable ? 'NODE_HTTP_503' : undefined,
                    }),
                    addUsers: async () => ({
                        isOk: false,
                        code: unavailable ? 'NODE_HTTP_503' : undefined,
                    }),
                    deleteUsers: async () => ({
                        isOk: false,
                        code: unavailable ? 'NODE_HTTP_503' : undefined,
                    }),
                };
                const worker = new Worker(axios, f.service);
                await assert.rejects(
                    worker.process({
                        name: adding ? (bulk ? 'addBulk' : 'add') : bulk ? 'removeBulk' : 'remove',
                        data: { node, data: wire },
                        opts: { attempts: 5 },
                        attemptsMade: 4,
                    }),
                    /delivery is pending/,
                );
                assert.deepEqual(f.pending, [[1n]]);
            });
}

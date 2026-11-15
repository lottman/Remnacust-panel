const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } = require('kysely');
const load = require('./load-typescript.cjs');
const { PortPlanLeaseService, PortPlanLeaseLostError } = load(
    path.join(__dirname, '../src/queue/_nodes/port-plan-lease.service.ts'),
    { '@common/database': {} },
);

function fixture() {
    const node = {
        uuid: randomUUID(),
        address: 'anchor.example.test',
        port: 2222,
        proxyUrl: null,
        activeConfigProfileUuid: randomUUID(),
        isDisabled: false,
        controlAddresses: [{ address: 'a.example.test', enabled: true }],
        controlRevision: randomUUID(),
        isConnected: true,
        lastStatusMessage: null,
    };
    const original = structuredClone(node),
        queries = [];
    const lease = { nodeUuid: node.uuid, owner: randomUUID() };
    let active = false,
        actions = 0;
    const fields = {
        uuid: 'uuid',
        is_disabled: 'isDisabled',
        active_config_profile_uuid: 'activeConfigProfileUuid',
        address: 'address',
        port: 'port',
        proxy_url: 'proxyUrl',
        control_revision: 'controlRevision',
    };
    const connection = {
        async executeQuery(query) {
            assert.equal(active, true, 'Commit fences must run inside their transaction');
            queries.push(query);
            if (/SELECT\s+uuid\s+FROM\s+nodes\b/i.test(query.sql)) {
                assert.match(query.sql, /FOR UPDATE/i);
                for (const [column, field] of Object.entries(fields)) {
                    const condition = new RegExp(
                        `\\b${column}\\s*(=|IS NOT DISTINCT FROM)\\s*\\$(\\d+)`,
                        'i',
                    ).exec(query.sql);
                    if (!condition) continue;
                    const value = query.parameters[Number(condition[2]) - 1];
                    if ((condition[1] === '=' && value == null) || value !== node[field])
                        return { rows: [] };
                }
                return { rows: [{ uuid: node.uuid }] };
            }
            assert.match(query.sql, /JOIN nodes n ON n.uuid=p.node_uuid/);
            assert.equal(query.parameters[0], lease.nodeUuid);
            assert.equal(query.parameters[1], lease.owner);
            return { rows: [{ node_uuid: node.uuid }] };
        },
        streamQuery() {
            throw new Error('Unexpected streaming query');
        },
    };
    const driver = {
        async init() {},
        async acquireConnection() {
            return connection;
        },
        async releaseConnection() {},
        async destroy() {},
    };
    const db = new Kysely({
        dialect: {
            createDriver: () => driver,
            createAdapter: () => new PostgresAdapter(),
            createQueryCompiler: () => new PostgresQueryCompiler(),
            createIntrospector: (database) => new PostgresIntrospector(database),
        },
    });
    const transactions = {
        isTransactionActive: () => active,
        async withTransaction(options, work) {
            assert.equal(options.timeout, 10_000);
            assert.equal(active, false);
            active = true;
            try {
                return await work();
            } finally {
                active = false;
            }
        },
    };
    const service = new PortPlanLeaseService({ kysely: db }, transactions, {});
    return {
        node,
        original,
        queries,
        close: () => db.destroy(),
        actions: () => actions,
        edit(address) {
            node.controlAddresses = [{ address, enabled: true }];
            node.controlRevision = randomUUID();
        },
        async commit(kind, snapshot = original) {
            const action = async () => {
                actions++;
                return 'committed';
            };
            return kind === 'lifecycle'
                ? service.commitLifecycleStatus(snapshot, action)
                : service.commit(lease, action, snapshot);
        },
    };
}

for (const kind of ['lifecycle', 'port-plan']) {
    for (const aba of [false, true]) {
        test(`${kind}: a canonical control ${aba ? 'A to B to A edit' : 'address edit'} fences the old acknowledgement`, async (t) => {
            const f = fixture();
            t.after(f.close);
            f.edit('b.example.test');
            if (aba) f.edit('a.example.test');
            assert.equal(f.node.address, f.original.address);
            if (aba) assert.deepEqual(f.node.controlAddresses, f.original.controlAddresses);
            assert.notEqual(f.node.controlRevision, f.original.controlRevision);
            if (kind === 'lifecycle') assert.equal(await f.commit(kind), undefined);
            else await assert.rejects(f.commit(kind), PortPlanLeaseLostError);
            assert.equal(f.actions(), 0);
            assert.equal(
                f.queries.length,
                1,
                'A stale acknowledgement must not advance to the plan ownership query',
            );
        });
    }
    test(`${kind}: heartbeat and metadata changes keep the same captured control revision valid`, async (t) => {
        const f = fixture();
        t.after(f.close);
        f.node.isConnected = false;
        f.node.lastStatusMessage = 'heartbeat';
        f.node.note = 'metadata only';
        assert.equal(await f.commit(kind), 'committed');
        assert.equal(f.actions(), 1);
        const fence = f.queries[0];
        assert.match(fence.sql, /AND\s+control_revision\s*=\s*\$\d+::uuid/i);
        assert(fence.parameters.includes(f.original.controlRevision));
    });
    test(`${kind}: a refreshed row revision accepts an acknowledgement after ABA`, async (t) => {
        const f = fixture();
        t.after(f.close);
        f.edit('b.example.test');
        f.edit('a.example.test');
        assert.equal(await f.commit(kind, structuredClone(f.node)), 'committed');
        assert.equal(f.actions(), 1);
    });
    test(`${kind}: a runtime snapshot missing the required control revision cannot run its SQL action`, async (t) => {
        const f = fixture();
        t.after(f.close);
        const snapshot = { ...f.original };
        delete snapshot.controlRevision;
        if (kind === 'lifecycle') assert.equal(await f.commit(kind, snapshot), undefined);
        else await assert.rejects(f.commit(kind, snapshot), PortPlanLeaseLostError);
        assert.equal(f.actions(), 0);
    });
}

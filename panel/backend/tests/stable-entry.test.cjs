const assert = require('node:assert/strict');
const { test } = require('node:test');
const { source } = require('./upstream-filter-fixture.cjs');
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const { StableEntryService } = source('modules/node-ssh/stable-entry.service.ts', {
    '@modules/nodes/node-port-plans.service': {},
    '@modules/nodes/queries/get-node-by-uuid/get-node-by-uuid.query': {
        GetNodeByUuidQuery: class {
            constructor(uuid) {
                this.uuid = uuid;
            }
        },
    },
});
const { nodeUpgradeSchema, nodeUpgradeScript } = source('modules/node-ssh/ssh/node-upgrade.ts');

test('entry resolves only servers of one host and the applied TCP binding', async () => {
    const inbound = { uuid: id(7), port: 8443, network: 'tcp' };
    const host = {
        uuid: id(9),
        port: 443,
        configProfileUuid: id(8),
        configProfileInboundUuid: id(7),
        nodes: [{ nodeUuid: id(1) }, { nodeUuid: id(2) }],
    };
    const nodes = new Map(
        [0, 1, 2].map((n) => [
            id(n),
            {
                uuid: id(n),
                port: 2222,
                address: `192.0.2.${n + 1}`,
                ips: [],
                isConnected: true,
                activeConfigProfileUuid: id(8),
                activeInbounds: n ? [inbound] : [],
            },
        ]),
    );
    const states = new Map([0, 1, 2].map((n) => [id(n), { enabled: false, bindings: [] }]));
    const service = new StableEntryService(
        { tx: { hosts: { findUnique: async () => host } } },
        { execute: async (q) => ({ isOk: true, response: nodes.get(q.uuid) }) },
        { get: async (uuid) => states.get(uuid) },
    );
    const input = {
        hostUuid: id(9),
        listenPort: 443,
        strategy: 'priority',
        backendNodeUuids: [id(2), id(1)],
    };
    assert.deepEqual(await service.prepare(id(0), input), {
        listenPort: 443,
        strategy: 'priority',
        backends: [
            { address: '192.0.2.3', port: 8443 },
            { address: '192.0.2.2', port: 8443 },
        ],
    });
    await assert.rejects(
        () => service.prepare(id(0), { ...input, backendNodeUuids: [id(0)] }),
        /not assigned/,
    );
    await assert.rejects(
        () => service.prepare(id(0), { ...input, listenPort: 444 }),
        /enabled host/,
    );
    nodes.get(id(2)).isConnected = false;
    await assert.rejects(() => service.prepare(id(0), input), /unavailable/);
    nodes.get(id(2)).isConnected = true;
    states.set(id(2), {
        enabled: true,
        status: 'PENDING',
        revision: '2',
        appliedRevision: '1',
        bindings: [],
    });
    await assert.rejects(() => service.prepare(id(0), input), /Wait/);
    states.set(id(2), {
        enabled: true,
        status: 'APPLIED',
        revision: '2',
        appliedRevision: '2',
        bindings: [{ configProfileInboundUuid: id(7), networks: ['tcp'], port: 9443 }],
    });
    assert.equal((await service.prepare(id(0), input)).backends[0].port, 9443);
    nodes.get(id(2)).address = nodes.get(id(0)).address;
    await assert.rejects(() => service.prepare(id(0), input), /point back/);
});

test('entry SSH command uses verified installer, cannot become a node upgrade or shell injection', () => {
    const request = {
        t: 'node-upgrade',
        id: id(1),
        directory: '/opt/remnacust/entry',
        operation: 'configure-entry',
        entry: {
            hostUuid: id(9),
            listenPort: 443,
            strategy: 'priority',
            backendNodeUuids: [id(2)],
        },
    };
    assert.equal(
        nodeUpgradeSchema.safeParse({
            ...request,
            entry: { ...request.entry, backendNodeUuids: [id(2), id(2)] },
        }).success,
        false,
    );
    assert.equal(
        nodeUpgradeSchema.safeParse({ ...request, panelIp: "1.2.3.4';evil" }).success,
        false,
    );
    assert.throws(() => nodeUpgradeScript(request), /Entry context/);
    const script = nodeUpgradeScript(request, undefined, {
        listenPort: 443,
        strategy: 'priority',
        backends: [{ address: '192.0.2.2', port: 8443 }],
    });
    assert.match(script, /configure-entry-node --entry-config/);
    assert.match(script, /Installer checksum mismatch/);
    assert.doesNotMatch(script, /upgrade-node --directory/);
    assert.doesNotMatch(script, /\[\[ -d "\$directory" \]\]/);
});

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '../src/common/xray-mode');
const { XrayModeService } = load(path.join(root, 'xray-mode.service.ts'), {
    '@common/database/prisma.service': {},
});
const { rethrowXrayModeConflict, hasXrayDatabaseCode } = load(
    path.join(root, 'xray-mode-conflict.ts'),
);

test('preflight reads and CAS use the same transaction after its exclusive settings lock', async () => {
    const calls = [];
    const tx = {
        $queryRaw: async (strings) => {
            const sql = strings.join('');
            calls.push(sql);
            if (sql.includes('FOR UPDATE NOWAIT')) return [{ mode: 'custom', revision: 8 }];
            if (sql.includes('UPDATE xera_xray_settings'))
                return [{ mode: 'default', revision: 9 }];
            return [];
        },
    };
    const service = new XrayModeService({
        $transaction: async (work, options) => {
            assert.equal(options.isolationLevel, 'ReadCommitted');
            return work(tx);
        },
        $queryRaw: () => {
            throw Error('preflight escaped transaction');
        },
    });
    assert.deepEqual(await service.change('default', 8), { mode: 'default', revision: 9 });
    assert.match(calls[0], /FOR UPDATE NOWAIT/);
    assert.equal(calls.length, 6);
    assert.match(calls.at(-1), /apply_pending=true/);
});

test('CAS rejects stale revisions before preflight or mutation', async () => {
    let calls = 0;
    const service = new XrayModeService({
        $transaction: async (work) =>
            work({
                $queryRaw: async () => {
                    calls++;
                    return [{ mode: 'custom', revision: 3 }];
                },
            }),
    });
    await assert.rejects(
        service.change('default', 2),
        (e) => e.getResponse().code === 'XRAY_SETTINGS_CHANGED',
    );
    assert.equal(calls, 1);
});

test('preflight reports referenced custom snippets from the transaction-scoped DB resolver', async () => {
    const service = new XrayModeService({
        $queryRaw: async (strings) =>
            strings.join('').includes('config_profiles p')
                ? [
                      {
                          uuid: 'profile',
                          name: 'Profile',
                          config: { routing: { rules: [{ snippet: 'custom-rule' }] } },
                          snippetRequiresCustom: true,
                      },
                  ]
                : [],
    });
    assert.deepEqual(await service.defaultBlockers(), [
        { code: 'custom-profile', id: 'profile', name: 'Profile', paths: ['referenced-snippet'] },
    ]);
});

test('transient lock contention retries a fresh transaction without changing revision', async () => {
    let attempts = 0;
    const service = new XrayModeService({
        $transaction: async (work) => {
            if (++attempts === 1) throw { code: 'P2010', meta: { code: '55P03' } };
            return work({
                $queryRaw: async (strings) =>
                    strings.join('').includes('FOR UPDATE')
                        ? [{ mode: 'custom', revision: 4 }]
                        : [{ mode: 'custom', revision: 5 }],
            });
        },
    });
    assert.deepEqual(await service.change('custom', 4), { mode: 'custom', revision: 5 });
    assert.equal(attempts, 2);
});

test('only exact nested DB custom-conflict codes map to HTTP409; unrelated errors retain identity', () => {
    for (const error of [
        { code: 'P0C01' },
        { meta: { driverAdapterError: { cause: { originalCode: 'P0C01' } } } },
        { cause: { cause: { code: 'P0C01' } } },
    ])
        assert.throws(
            () => rethrowXrayModeConflict(error),
            (e) => e.getStatus() === 409 && e.errorCode === 'CUSTOM_XRAY_REQUIRED',
        );
    const cycle = { message: 'P0C01' };
    cycle.cause = cycle;
    assert.equal(hasXrayDatabaseCode(cycle, 'P0C01'), false);
    assert.doesNotThrow(() => rethrowXrayModeConflict(cycle));
});

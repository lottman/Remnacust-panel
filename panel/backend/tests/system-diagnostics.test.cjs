const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');

const row = {
    version: 170006,
    tracking: true,
    connections: 9,
    active: 2,
    locks: 1,
    idle: 1,
    unknown: 0,
    longest: 3.5,
};
function fixture() {
    let now = 0,
        calls = 0,
        value = { ...row },
        error,
        release;
    const statements = [],
        warnings = [];
    let gate;
    const prisma = {
        $transaction: async (action, options) => {
            calls++;
            assert.deepEqual(options, { maxWait: 500, timeout: 2500 });
            if (gate) await gate;
            if (error) throw error;
            return action({
                $executeRaw: async (parts) => {
                    statements.push(parts.join(''));
                },
                $queryRaw: async (parts) => {
                    statements.push(parts.join(''));
                    return [value];
                },
            });
        },
    };
    const { SystemDiagnosticsService } = load(
        path.join(__dirname, '../src/modules/system/system-diagnostics.service.ts'),
        {
            '@common/database/prisma.service': {},
            '@nestjs/common': {
                Injectable: () => (target) => target,
                Logger: class {
                    warn(message) {
                        warnings.push(message);
                    }
                },
            },
        },
        { performance: { now: () => now } },
    );
    const service = new SystemDiagnosticsService(prisma);
    return {
        service,
        statements,
        warnings,
        calls: () => calls,
        time: (value) => {
            now = value;
        },
        row: (next) => {
            value = next;
        },
        error: (value) => {
            error = value;
        },
        hold: () => {
            gate = new Promise((resolve) => {
                release = resolve;
            });
        },
        release: () => release(),
    };
}

test('parallel diagnostic requests share one bounded read-only sample and preserve its timestamp', async () => {
    const f = fixture();
    f.hold();
    const requests = Array.from({ length: 100 }, () => f.service.getSnapshot());
    assert.equal(f.calls(), 1);
    f.release();
    const results = await Promise.all(requests);
    assert(results.every((result) => result === results[0]));
    assert.equal(results[0].status, 'ok');
    assert.deepEqual(results[0].database, {
        version: '17.6',
        connections: 9,
        activeQueries: 2,
        lockWaits: 1,
        idleInTransaction: 1,
        longestQuerySeconds: 3.5,
        visibility: 'complete',
    });
    f.time(14999);
    assert.equal(await f.service.getSnapshot(), results[0]);
    assert.equal(f.calls(), 1);
    f.time(15001);
    await f.service.getSnapshot();
    assert.equal(f.calls(), 2);
    const sql = f.statements.join('\n');
    assert.match(sql, /SET TRANSACTION READ ONLY/);
    assert.match(sql, /statement_timeout = '1000ms'/);
    assert.match(sql, /datname = current_database\(\)/);
    assert.match(sql, /rolname = current_user/);
    assert.match(sql, /pid <> pg_backend_pid\(\)/);
    assert.doesNotMatch(
        sql,
        /SELECT\s+\*|pg_stat_statements|pg_terminate_backend|pg_cancel_backend/i,
    );
});

test('database failure invalidates old values, cools down retries and never exposes error details', async () => {
    const f = fixture();
    await f.service.getSnapshot();
    f.time(15001);
    f.error(new Error('postgresql://private:secret@internal/private SQL content'));
    const result = await f.service.getSnapshot();
    assert.deepEqual(result, { sampledAt: null, status: 'unavailable', database: null });
    assert.doesNotMatch(
        JSON.stringify([result, f.warnings]),
        /private|secret|internal|SQL content/,
    );
    for (let i = 0; i < 40; i++) await f.service.getSnapshot();
    assert.equal(f.calls(), 2);
    assert.equal(f.warnings.length, 1);
    f.time(20002);
    await f.service.getSnapshot();
    assert.equal(f.calls(), 3);
    assert.equal(f.warnings.length, 1);
    f.time(25003);
    f.error(undefined);
    assert.equal((await f.service.getSnapshot()).status, 'ok');
});

test('missing activity tracking is explicit and malformed measurements never become healthy zeros', async () => {
    for (const [change, expected] of [
        [{ tracking: false }, 'disabled'],
        [{ unknown: 2 }, 'partial'],
    ]) {
        const f = fixture();
        f.row({ ...row, ...change });
        assert.equal((await f.service.getSnapshot()).database.visibility, expected);
    }
    for (const change of [
        { connections: -1 },
        { active: 0.5 },
        { longest: NaN },
        { longest: -1 },
        { version: 0 },
        { tracking: null },
    ]) {
        const f = fixture();
        f.row({ ...row, ...change });
        assert.equal((await f.service.getSnapshot()).status, 'unavailable');
    }
});

test('diagnostics are administrator-only and cannot be obtained with wildcard API grants', () => {
    const fixture = require('./api-permissions-fixture.cjs');
    const { SystemDiagnosticsController } = fixture.load(
        'src/modules/system/system-diagnostics.controller.ts',
    );
    const endpoint = {
        controller: SystemDiagnosticsController,
        handler: SystemDiagnosticsController.prototype.get,
    };
    assert.equal(fixture.authorize(endpoint, fixture.ROLE.ADMIN), true);
    for (const scopes of [[], ['*'], ['system:*'], ['system:read']])
        assert.equal(fixture.authorize(endpoint, fixture.ROLE.API, scopes), false);
});

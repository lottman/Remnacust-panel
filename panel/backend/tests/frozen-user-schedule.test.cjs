const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { freezeScheduleError } = load(
    path.join(__dirname, '../src/common/utils/user-freeze-schedule.ts'),
);
const { effectiveUserExpiry, frozenDateEdit } = load(
    path.join(__dirname, '../src/common/utils/frozen-user-lifetime.ts'),
);
const now = Date.parse('2026-11-12T12:00:00Z');
const future = new Date(now + 86400000);

test('new freezes require a valid future UTC deadline, not an implicit indefinite freeze', () => {
    for (const frozenUntil of [undefined, null, new Date(NaN), new Date(now), new Date(now - 1)]) {
        assert.equal(
            freezeScheduleError({ status: 'ACTIVE' }, { status: 'FROZEN', frozenUntil }, now),
            'invalid',
        );
    }
    assert.equal(freezeScheduleError(null, { status: 'FROZEN', frozenUntil: future }, now), null);
    assert.equal(
        freezeScheduleError(
            { status: 'ACTIVE' },
            { status: 'FROZEN', frozenUntil: future.toISOString() },
            now,
        ),
        null,
    );
});

test('saved deadlines are immutable, repeated saves and early activation remain safe', () => {
    const user = { status: 'FROZEN', frozenUntil: future };
    assert.equal(freezeScheduleError(user, { status: 'FROZEN' }, now), null);
    assert.equal(freezeScheduleError(user, { frozenUntil: new Date(+future) }, now), null);
    assert.equal(freezeScheduleError(user, { frozenUntil: null }, now), 'immutable');
    assert.equal(
        freezeScheduleError(user, { frozenUntil: new Date(+future + 1000) }, now),
        'immutable',
    );
    assert.equal(freezeScheduleError(user, { status: 'ACTIVE' }, now), null);
});

test('legacy frozen users keep their state and can receive a deadline once', () => {
    const user = { status: 'FROZEN', frozenUntil: null };
    assert.equal(freezeScheduleError(user, {}, now), null);
    assert.equal(freezeScheduleError(user, { frozenUntil: future }, now), null);
    assert.equal(freezeScheduleError(user, { status: 'FROZEN' }, now), 'invalid');
});

test('projected expiry uses the scheduled deadline, including a delayed panel recovery', () => {
    const user = {
        status: 'FROZEN',
        frozenUntil: future,
        frozenAt: new Date(now),
        expireAt: new Date(now + 9 * 86400000),
    };
    for (const clock of [now, now + 86400000, now + 3 * 86400000]) {
        assert.equal(+effectiveUserExpiry(user, clock), +future + 9 * 86400000);
    }
});

test('transport contracts retain the deadline and reject timezone-ambiguous dates', () => {
    const {
        CreateUserCommand,
        UpdateUserCommand,
        BulkUpdateUsersCommand,
        BulkAllUpdateUsersCommand,
    } = require('../libs/contract/build/backend/index.js');
    const deadline = '2031-01-01T12:00:00+03:00';
    const schemas = [
        [
            CreateUserCommand.RequestBodySchema,
            { username: 'scheduled_user', expireAt: '2035-01-01T00:00:00Z' },
        ],
        [UpdateUserCommand.RequestBodySchema, { id: 1 }],
        [BulkUpdateUsersCommand.RequestBodySchema.shape.fields, {}],
        [BulkAllUpdateUsersCommand.RequestBodySchema, {}],
    ];
    for (const [schema, body] of schemas) {
        const parsed = schema.parse({ ...body, status: 'FROZEN', frozenUntil: deadline });
        assert.equal(parsed.frozenUntil.toISOString(), '2031-01-01T09:00:00.000Z');
        assert.equal(
            schema.safeParse({ ...body, status: 'FROZEN', frozenUntil: '2031-01-01T12:00:00' })
                .success,
            false,
        );
    }
});

test('date conversion for a scheduled freeze uses the same projected clock as its response', () => {
    const user = {
        status: 'FROZEN',
        frozenUntil: future,
        frozenAt: new Date(now),
        expireAt: new Date(now + 9 * 86400000),
    };
    assert.equal(+frozenDateEdit(user, new Date(+future + 2 * 86400000), now), now + 2 * 86400000);
});

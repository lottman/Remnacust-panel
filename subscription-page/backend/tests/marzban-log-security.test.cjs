const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const { JwtService } = require('@nestjs/jwt');
const load = require('./load-typescript.cjs');

const { MarzbanService } = load(path.join(__dirname, '../src/modules/marzban/marzban.service.ts'), {
    '@common/utils': load(path.join(__dirname, '../src/common/utils/sanitize-username.ts')),
});
const keys = ['fixture-old-signing-key', 'fixture-current-signing-key'];
const username = 'fixture-user';
const issuedAt = Math.floor(Date.now() / 1000) - 60;
const shortUuid = 'fixture-resolved-subscription';

function fixture(options = {}) {
    const logs = [];
    const lookups = [];
    const values = {
        MARZBAN_LEGACY_SECRET_KEY: keys.join(','),
        MARZBAN_LEGACY_SUBSCRIPTION_VALID_FROM: options.validFrom,
        MARZBAN_LEGACY_DROP_REVOKED_SUBSCRIPTIONS: options.dropRevoked ?? false,
    };
    const jwt = new JwtService();
    const service = new MarzbanService(
        { get: (key) => values[key], getOrThrow: (key) => values[key] },
        options.jwt ?? jwt,
        {
            getUserByUsername: async (ip, name) => {
                lookups.push({ ip, name });
                return {
                    isOk: true,
                    response: { response: { shortUuid, subRevokedAt: options.revokedAt ?? null } },
                };
            },
        },
    );
    service.logger = Object.fromEntries(
        ['debug', 'log', 'warn', 'error'].map((level) => [
            level,
            (...args) => logs.push({ level, args: args.map(String) }),
        ]),
    );
    return { service, logs, lookups, jwt };
}

function legacyToken(decoded, key = keys[1]) {
    const body = Buffer.from(decoded).toString('base64url');
    const signature = createHash('sha256')
        .update(body + key)
        .digest('base64url')
        .slice(0, 10);
    return { token: body + signature, body, signature, decoded };
}

function assertNoCredentials(logs, values) {
    const output = JSON.stringify(logs);
    for (const value of [...keys, shortUuid, ...values]) {
        assert.equal(output.includes(value), false, `credential appeared in logs: ${value}`);
    }
}

test('invalid legacy links never log configured keys, tokens, parts or computed signatures', async () => {
    const f = fixture();
    const invalid = legacyToken('fixture-invalid-decoded-payload');
    const tampered = invalid.body + 'WRONGSIG00';
    for (const token of ['tiny', tampered, invalid.token]) {
        assert.deepEqual(await f.service.resolveShortUuid(token, '127.0.0.1'), {
            dropConnection: false,
            shortUuid: null,
        });
    }
    assert.equal(f.lookups.length, 0);
    assertNoCredentials(f.logs, [
        'tiny',
        tampered,
        invalid.token,
        invalid.body,
        invalid.signature,
        invalid.decoded,
        'WRONGSIG00',
    ]);
});

test('rotated legacy keys still decode valid links without logging credentials', async () => {
    const f = fixture();
    const valid = legacyToken(`${username},${issuedAt}`);
    assert.deepEqual(await f.service.resolveShortUuid(valid.token, '127.0.0.1'), {
        dropConnection: false,
        shortUuid,
    });
    assert.deepEqual(f.lookups, [{ ip: '127.0.0.1', name: username }]);
    assertNoCredentials(f.logs, [valid.token, valid.body, valid.signature, valid.decoded]);
});

test('JWT links retain HS256 verification and key rotation without logging tokens or payloads', async () => {
    const f = fixture();
    const marker = 'fixture-private-jwt-payload';
    const payload = { sub: username, iat: issuedAt, access: 'subscription', marker };
    const valid = f.jwt.sign(payload, { secret: keys[1], algorithm: 'HS256' });
    assert.deepEqual(await f.service.resolveShortUuid(valid, '127.0.0.1'), {
        dropConnection: false,
        shortUuid,
    });
    const invalid = [
        f.jwt.sign(payload, { secret: 'fixture-untrusted-key', algorithm: 'HS256' }),
        f.jwt.sign(payload, { secret: keys[1], algorithm: 'HS384' }),
        f.jwt.sign({ ...payload, exp: issuedAt }, { secret: keys[1], algorithm: 'HS256' }),
        f.jwt.sign({ ...payload, access: 'admin' }, { secret: keys[1], algorithm: 'HS256' }),
    ];
    for (const token of invalid) {
        assert.deepEqual(await f.service.resolveShortUuid(token, '127.0.0.1'), {
            dropConnection: false,
            shortUuid: null,
        });
    }
    assert.equal(f.lookups.length, 1);
    assertNoCredentials(f.logs, [valid, ...valid.split('.'), marker, ...invalid]);
});

test('JWT verifier errors cannot echo credential-bearing exception messages into debug logs', async () => {
    const marker = 'fixture-secret-verifier-error';
    const f = fixture({
        jwt: {
            verifyAsync: async () => {
                throw new Error(marker);
            },
        },
    });
    const token = 'fixture-header.fixture-body.fixture-signature';
    assert.deepEqual(await f.service.resolveShortUuid(token, '127.0.0.1'), {
        dropConnection: false,
        shortUuid: null,
    });
    assertNoCredentials(f.logs, [marker, token, ...token.split('.')]);
});

test('legacy validity dates, invalid timestamps and subscription revocation remain enforced', async () => {
    const expired = fixture({ validFrom: new Date((issuedAt + 30) * 1000).toISOString() });
    const legacy = legacyToken(`${username},${issuedAt}`);
    const jwt = expired.jwt.sign(
        { sub: username, iat: issuedAt, access: 'subscription' },
        { secret: keys[1], algorithm: 'HS256' },
    );
    const badTimestamp = legacyToken(`${username},fixture-invalid-timestamp`);
    for (const token of [legacy.token, jwt, badTimestamp.token]) {
        assert.equal((await expired.service.resolveShortUuid(token, '127.0.0.1')).shortUuid, null);
    }
    assert.equal(expired.lookups.length, 0);
    assertNoCredentials(expired.logs, [
        legacy.token,
        legacy.body,
        legacy.signature,
        jwt,
        badTimestamp.token,
        'fixture-invalid-timestamp',
    ]);
    const revoked = fixture({ dropRevoked: true, revokedAt: new Date().toISOString() });
    assert.deepEqual(await revoked.service.resolveShortUuid(legacy.token, '127.0.0.1'), {
        dropConnection: true,
        shortUuid: null,
    });
    assertNoCredentials(revoked.logs, [legacy.token, legacy.body, legacy.signature]);
});

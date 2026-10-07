const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '..');
const ok = (response) => ({ isOk: true, response });
const resultTypes = { ok, fail: (error) => ({ isOk: false, error }) };
const errors = { FORBIDDEN: {}, INTERNAL_SERVER_ERROR: {} };
const { UpdatePasskeyCommand } = load(path.join(root, 'src/modules/admin/commands/update-passkey/update-passkey.command.ts'));
const { PasskeyRepository } = load(path.join(root, 'src/modules/admin/repositories/passkey.repository.ts'));
const { UpdatePasskeyHandler } = load(path.join(root, 'src/modules/admin/commands/update-passkey/update-passkey.handler.ts'), {
    '@contract/constants': { ERRORS: errors }, '@common/types': resultTypes,
    './update-passkey.command': { UpdatePasskeyCommand },
});

function persistence(counter) {
    let row = { id: 'fixture-key', counter };
    const queries = [];
    const repository = new PasskeyRepository({ tx: { passkeys: {
        update: async (query) => {
            queries.push(query);
            // Model one atomic database statement, using the actual repository predicate.
            if (query.where.id !== row.id ||
                ('counter' in query.where && query.where.counter !== row.counter)) {
                throw Object.assign(new Error('Record not found'), { code: 'P2025' });
            }
            row = { ...row, ...query.data };
            return { ...row };
        },
    } } }, { fromPrismaModelToEntity: (model) => model });
    const handler = new UpdatePasskeyHandler(repository);
    handler.logger = { error() {} };
    return { repository, handler, queries, row: () => ({ ...row }) };
}

test('actual command/handler/repository put the expected counter in the atomic Prisma update predicate', async () => {
    const f = persistence(10n);
    const results = await Promise.all([
        f.handler.execute(new UpdatePasskeyCommand('fixture-key', { counter: 12n }, 10n)),
        f.handler.execute(new UpdatePasskeyCommand('fixture-key', { counter: 11n }, 10n)),
    ]);
    assert.deepEqual(f.queries.map((q) => q.where), [
        { id: 'fixture-key', counter: 10n }, { id: 'fixture-key', counter: 10n },
    ]);
    assert.deepEqual(results.map((r) => r.isOk), [true, false]);
    assert.equal(f.row().counter, 12n);
    const stale = await Promise.all([11n, 13n].map((counter) =>
        f.handler.execute(new UpdatePasskeyCommand('fixture-key', { counter }, 10n))));
    assert.equal(stale.every((r) => !r.isOk), true);
    assert.equal(f.row().counter, 12n);
});

test('zero is an explicit CAS condition; zero-counter authenticators and metadata edits remain supported', async () => {
    const f = persistence(0n);
    for (let i = 0; i < 2; i++) {
        assert.equal((await f.handler.execute(new UpdatePasskeyCommand('fixture-key', { counter: 0n }, 0n))).isOk, true);
        assert.deepEqual(f.queries[i].where, { id: 'fixture-key', counter: 0n });
    }
    await f.repository.update({ id: 'fixture-key', updatedAt: new Date(0) });
    assert.deepEqual(f.queries[2].where, { id: 'fixture-key' });
    assert.equal(f.row().counter, 0n);
});

function authentication(f, concurrent = false) {
    const filename = path.join(root, 'src/modules/auth/auth.service.ts');
    const ast = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    const mocks = {};
    for (const node of ast.statements) {
        if (ts.isImportDeclaration(node) && !node.moduleSpecifier.text.startsWith('node:')) mocks[node.moduleSpecifier.text] = {};
    }
    mocks['@nestjs/common'] = require('@nestjs/common');
    mocks['@common/types'] = resultTypes;
    mocks['@common/utils/admin-session'] = load(path.join(root, 'src/common/utils/admin-session.ts'));
    mocks['@libs/contracts/constants'] = { ROLE: { ADMIN: 'ADMIN' }, CACHE_KEYS: { PASSKEY_AUTHENTICATION_CHALLENGE: (key) => key } };
    mocks['@libs/contracts/constants/errors'] = { ERRORS: errors };
    mocks['@modules/admin/queries/find-passkey-by-id-and-uuid'] = { FindPasskeyByIdAndAdminUuidQuery: class {} };
    mocks['@modules/admin/commands/update-passkey'] = { UpdatePasskeyCommand };
    // Only cryptographic verification is mocked: these tests exercise persistence and issuance.
    mocks['@simplewebauthn/server'] = { verifyAuthenticationResponse: async ({ response, expectedOrigin, expectedRPID }) => {
        assert.equal(expectedOrigin, 'https://panel.example.test');
        assert.equal(expectedRPID, 'example.test');
        return { verified: true, authenticationInfo: { newCounter: response.testCounter } };
    } };
    const service = Object.create(load(filename, mocks).AuthService.prototype);
    const admin = { uuid: 'fixture-admin', username: 'admin', passwordHash: 'fixture-hash' };
    service.getFirstAdmin = async () => ok(admin);
    service.logger = { error() {} };
    let signed = 0;
    let sessions = 0;
    let successes = 0;
    service.jwtSecret = 'fixture-only';
    service.jwtLifetime = 1;
    service.jwtService = { sign: () => { signed++; return 'fixture-token'; } };
    const challenges = new Set(['challenge-a', 'challenge-b']);
    service.rawCacheService = {
        getDelString: async (key) => challenges.delete(key) ? admin.uuid : null,
        setString: async () => { sessions++; },
    };
    let snapshots = 0;
    let release;
    const barrier = new Promise((resolve) => { release = resolve; });
    service.queryBus = { execute: async () => {
        const snapshot = { ...f.row(), publicKey: new Uint8Array(), getTransports: () => [] };
        if (concurrent) {
            if (++snapshots === 2) release();
            await barrier;
        }
        return ok(snapshot);
    } };
    service.commandBus = { execute: (command) => f.handler.execute(command) };
    service.emitFailedLoginAttempt = async () => {};
    service.emitLoginSuccess = async () => { successes++; };
    return {
        service, counts: () => ({ signed, sessions, successes }),
        login: (challenge, counter) => service.verifyPasskeyAuthentication({ response: {
            id: 'fixture-key', testCounter: counter,
            response: { clientDataJSON: Buffer.from(JSON.stringify({ challenge })).toString('base64url') },
        } }, { passkeySettings: { enabled: true, origin: 'https://panel.example.test', rpId: 'example.test' } }, '', ''),
    };
}

test('failed counter persistence returns forbidden before signing or recording an active session', async () => {
    const f = persistence(10n);
    f.repository.update = async () => { throw new Error('Database unavailable'); };
    const auth = authentication(f);
    const result = await auth.login('challenge-a', 11);
    assert.equal(result.isOk, false);
    assert.equal(result.response?.accessToken, undefined);
    assert.deepEqual(auth.counts(), { signed: 0, sessions: 0, successes: 0 });
    assert.equal(f.row().counter, 10n);
});

test('two passkey logins reading the same positive counter can issue only one session', async () => {
    const f = persistence(10n);
    const auth = authentication(f, true);
    const results = await Promise.all([auth.login('challenge-a', 12), auth.login('challenge-b', 11)]);
    assert.equal(results.filter((r) => r.isOk).length, 1);
    assert.deepEqual(auth.counts(), { signed: 1, sessions: 1, successes: 1 });
    assert.equal(f.row().counter, 12n);
    assert.equal(results.find((r) => !r.isOk).response?.accessToken, undefined);
});

test('zero-counter passkeys accept distinct challenges but still reject challenge replay', async () => {
    const f = persistence(0n);
    const auth = authentication(f, true);
    const results = await Promise.all([auth.login('challenge-a', 0), auth.login('challenge-b', 0)]);
    assert.equal(results.every((r) => r.isOk), true);
    assert.equal((await auth.login('challenge-a', 0)).isOk, false);
    assert.deepEqual(auth.counts(), { signed: 2, sessions: 2, successes: 2 });
    assert.equal(f.row().counter, 0n);
});

test('registration atomically consumes the Redis challenge and passes only the configured origin', async () => {
    const filename = path.join(root, 'src/modules/admin/services/passkey.service.ts');
    const ast = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    const mocks = {};
    for (const node of ast.statements) {
        if (ts.isImportDeclaration(node)) mocks[node.moduleSpecifier.text] = {};
    }
    mocks['@nestjs/common'] = require('@nestjs/common');
    mocks['@common/types'] = resultTypes;
    mocks['@libs/contracts/constants'] = { CACHE_KEYS: { PASSKEY_REGISTRATION_OPTIONS: (uuid) => `registration:${uuid}` } };
    mocks['@libs/contracts/constants/errors'] = { ERRORS: errors };
    mocks['@modules/remnawave-settings/queries/get-cached-remnawave-settings'] = { GetCachedRemnawaveSettingsQuery: class {} };
    mocks['@modules/admin/entities'] = load(path.join(root, 'src/modules/admin/entities/passkey.entity.ts'));
    mocks['passkey-authenticator-aaguids'] = { findAuthenticatorById: () => null };
    const verifications = [];
    mocks['@simplewebauthn/server'] = { verifyRegistrationResponse: async (options) => {
        verifications.push(options);
        assert.equal(options.expectedOrigin, 'https://panel.example.test');
        assert.equal(options.expectedRPID, 'example.test');
        assert.equal(options.expectedChallenge, 'fixture-registration-challenge');
        return { verified: true, registrationInfo: {
            credential: { id: options.response.id, publicKey: new Uint8Array([1]), counter: 0 },
            credentialDeviceType: 'multiDevice', credentialBackedUp: true,
        } };
    } };
    const { RawCacheService } = load(path.join(root, 'src/common/raw-cache/raw-cache.service.ts'));
    const cached = new Map([['registration:fixture-admin', JSON.stringify('fixture-registration-challenge')]]);
    let getdels = 0;
    const cache = new RawCacheService({
        getdel: async (key) => {
            getdels++;
            const value = cached.get(key) ?? null;
            cached.delete(key);
            return value;
        },
        get: () => assert.fail('Registration must consume atomically'),
        del: () => assert.fail('A separate delete can race another registration'),
    }, {});
    const created = [];
    const service = Object.create(load(filename, mocks).PasskeyService.prototype);
    service.logger = { error() {} };
    service.rawCacheService = cache;
    service.adminRepository = { findByUUID: async () => ({ uuid: 'fixture-admin' }) };
    service.queryBus = { execute: async () => ({ passkeySettings: {
        enabled: true, origin: 'https://panel.example.test', rpId: 'example.test',
    } }) };
    service.passkeyRepository = { create: async (entity) => created.push(entity) };
    const verify = (id) => service.verifyPasskeyRegistration({ uuid: 'fixture-admin' }, { response: { id } });
    const results = await Promise.all([verify('credential-a'), verify('credential-b')]);
    assert.equal(results.filter((r) => r.isOk).length, 1);
    assert.equal(created.length, 1);
    assert.equal(verifications.length, 1);
    assert.equal((await verify('credential-c')).isOk, false);
    assert.equal(getdels, 3);
    assert.equal(cached.size, 0);
});

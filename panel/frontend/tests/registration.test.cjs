const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = require('../../backend/tests/load-typescript.cjs');
const { RegisterCommand } = require('../vendor/backend-contract/build/backend/commands/auth/register.command.js');
const { registrationErrors, generateRegistrationPassword } = load(
    path.join(__dirname, '../src/features/auth/register-form/registration.ts'),
    { '@remnawave/backend-contract': { RegisterCommand } },
);
const valid = (password) => ({ username: 'admin', password, confirmPassword: password });

test('registration enforces the server contract before sending a request', () => {
    for (const password of ['ShortPass12345', 'a'.repeat(24), 'A'.repeat(24), 'aA'.repeat(12), 'a1'.repeat(12), 'A1'.repeat(12)]) {
        assert.equal(RegisterCommand.RequestBodySchema.safeParse(valid(password)).success, false);
        assert.equal(registrationErrors(valid(password)).password, 'register-form.feature.password-requirements');
    }
    const password = 'aA1' + 'x'.repeat(21);
    assert.equal(RegisterCommand.RequestBodySchema.safeParse(valid(password)).success, true);
    assert.deepEqual(registrationErrors(valid(password)), {});
    assert.deepEqual(registrationErrors({ ...valid(password), username: '', confirmPassword: 'other' }), {
        username: 'register-form.feature.username-required', confirmPassword: 'register-form.feature.passwords-do-not-match',
    });
    assert.equal(registrationErrors({ ...valid(password), username: 'x'.repeat(257) }).username, 'register-form.feature.username-too-long');
    assert.equal(registrationErrors(valid(password + 'x'.repeat(1024))).password, 'register-form.feature.password-too-long');
});

test('every generated password meets the server contract, including a deterministic random source', () => {
    const zero = { getRandomValues: (bytes) => { bytes.fill(0); return bytes; } };
    for (const random of [zero, crypto]) {
        const values = new Set();
        for (let i = 0; i < 250; i++) {
            const password = generateRegistrationPassword(random);
            assert.equal(password.length, 32);
            assert.deepEqual(registrationErrors(valid(password)), {});
            assert.equal(RegisterCommand.RequestBodySchema.safeParse(valid(password)).success, true);
            values.add(password);
        }
        if (random === crypto) assert.equal(values.size, 250);
    }
});

test('generation rejects out-of-range bytes and never falls back to Math.random', () => {
    let first = true;
    const random = { getRandomValues: (bytes) => { bytes[0] = first ? 255 : 0; first = false; return bytes; } };
    assert.deepEqual(registrationErrors(valid(generateRegistrationPassword(random))), {});
    assert.throws(() => generateRegistrationPassword({ getRandomValues: () => { throw Error('unavailable'); } }), /unavailable/);
});

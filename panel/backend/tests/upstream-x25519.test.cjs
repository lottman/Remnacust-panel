const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const helpers = path.join(__dirname, '../src/common/helpers');
const { generateX25519PublicKey, generateEncryptionFromDecryption } = load(path.join(helpers, 'vless-encryption/generate-encryption-from-decryption.ts'));
const { resolveInboundAndPublicKey } = load(path.join(helpers, 'xray-config/resolve-public-key.ts'));
// Alice's scalar/public key from RFC 7748, independent of the implementation.
const scalar = Buffer.from('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a', 'hex');
const publicKey = Buffer.from('8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a', 'hex').toString('base64url');

test('X25519 derives the RFC 7748 public key from base64 and base64url', async () => {
    for (const encoding of ['base64', 'base64url']) {
        assert.equal(await generateX25519PublicKey(scalar.toString(encoding)), publicKey);
    }
});

test('VLESS encryption uses the matching public key without changing the private configuration', async () => {
    const decryption = `mlkem768x25519plus.native.600s.${scalar.toString('base64url')}`;
    const generated = await generateEncryptionFromDecryption(decryption);
    assert.equal(generated.encryption, `mlkem768x25519plus.native.0rtt.${publicKey}`);
    assert.equal(generated.publicKeys[0].value, publicKey);
});

test('one invalid REALITY private key does not hide valid keys from other inbounds', async () => {
    const result = await resolveInboundAndPublicKey([
        { tag: 'invalid', streamSettings: { realitySettings: { privateKey: 'bad' } } },
        { tag: 'valid', streamSettings: { realitySettings: { privateKey: scalar.toString('base64url') } } },
    ]);
    assert.deepEqual([...result], [['valid', publicKey]]);
    for (const size of [0, 31, 33]) {
        await assert.rejects(generateX25519PublicKey(Buffer.alloc(size).toString('base64')), /private key length/);
    }
});

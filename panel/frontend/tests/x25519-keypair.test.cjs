const test = require('node:test');
const assert = require('node:assert/strict');
const {createPrivateKey, createPublicKey} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const filename = path.join(__dirname, '../src/widgets/dashboard/config-profiles/keypair-generator/keypair-utils.ts');
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const moduleRef = {exports:{}};
new Function('require','exports','module',source)(require,moduleRef.exports,moduleRef);

test('X25519 publicKey matches the private key and the password alias',()=>{
    const keys = moduleRef.exports.generateX25519();
    assert.equal(keys.password, keys.publicKey);
    for (const field of ['publicKey','privateKey']) {
        assert.match(keys[field], /^[A-Za-z0-9_-]{43}$/);
        assert.equal(Buffer.from(keys[field], 'base64url').length, 32);
    }
    // Derive independently with Node/OpenSSL to catch a public/private mismatch.
    const der = Buffer.concat([Buffer.from('302e020100300506032b656e04220420','hex'),Buffer.from(keys.privateKey,'base64url')]);
    const privateKey = createPrivateKey({key:der,format:'der',type:'pkcs8'});
    assert.equal(createPublicKey(privateKey).export({format:'jwk'}).x, keys.publicKey);
    const next = moduleRef.exports.generateX25519();
    assert.notEqual(next.privateKey, keys.privateKey);
    assert.notEqual(next.publicKey, keys.publicKey);
    assert.equal(next.password, next.publicKey);
});

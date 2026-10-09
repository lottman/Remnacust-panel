const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const { randomBytes } = require('node:crypto');
const load = require('./load-typescript.cjs');
const nodeSource = require('./component-paths.cjs').nodeSource;

test('local HTTP authentication precedes JSON parsing and authenticated webhooks are bounded', async () => {
    const { createInternalHttpApp } = load(path.join(nodeSource, 'src/common/utils/internal-http-app.ts'));
    const { TokenAuthMiddleware } = load(path.join(nodeSource, 'src/common/middlewares/token-auth.middleware.ts'), {
        '@common/config/app-config': {},
    });
    const auth = new TokenAuthMiddleware({ getOrThrow: () => 'fixture-token' });
    let forwarded = 0;
    const app = createInternalHttpApp(auth.use.bind(auth), (_req, res) => { forwarded++; res.send('accepted'); }, ['/internal/webhook']);
    app.use((error, _req, res, _next) => res.status(error.status ?? 500).end());
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/internal/webhook`;
    try {
        await assert.rejects(fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }));
        assert.equal(forwarded, 0);
        const valid = await fetch(base + '?token=fixture-token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        assert.equal(valid.status, 200);
        assert.equal(await valid.text(), 'accepted');
        const oversized = await fetch(base + '?token=fixture-token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify('x'.repeat(1048576)) });
        assert.equal(oversized.status, 413);
        assert.equal(forwarded, 1);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

test('node SDK rejects an abstract socket, symlink or directory accessible by another user', () => {
    const uid = process.getuid?.();
    let directory = { isDirectory: () => true, mode: 0o40700, uid };
    const helper = load(path.join(nodeSource, 'src/common/utils/private-xtls-socket.ts'), {
        'node:fs': { lstatSync: () => directory },
    });
    const filename = '/run/remnacust-xray-AbCd123456/api.sock';
    assert.equal(helper.privateXtlsConnectionUrl(filename), `unix://${filename}`);
    for (const value of ['@xtls-api-foo', 'xtls-api-foo', '/run/public/api.sock', filename + ',0777']) {
        assert.throws(() => helper.privateXtlsConnectionUrl(value));
    }
    for (const value of [
        { isDirectory: () => false, mode: 0o40700, uid },
        { isDirectory: () => true, mode: 0o40755, uid },
        { isDirectory: () => true, mode: 0o40700, uid: -1 },
    ]) {
        directory = value;
        assert.throws(() => helper.privateXtlsConnectionUrl(filename));
    }
});

test('the node gRPC SDK can communicate over its private filesystem socket', {
    skip: process.platform !== 'linux' || process.getuid() !== 0,
}, async () => {
    const grpc = createRequire(path.join(nodeSource, 'package.json'))('@grpc/grpc-js');
    const directory = `/run/remnacust-xray-${randomBytes(5).toString('hex')}`;
    fs.mkdirSync(directory, { mode: 0o700 });
    const socketPath = path.join(directory, 'api.sock');
    const { privateXtlsConnectionUrl } = load(path.join(nodeSource, 'src/common/utils/private-xtls-socket.ts'));
    const target = privateXtlsConnectionUrl(socketPath);
    const encode = value => Buffer.from(value);
    const decode = value => value.toString();
    const definition = { ping: { path: '/fixture.Control/Ping', requestStream: false, responseStream: false,
        requestSerialize: encode, requestDeserialize: decode, responseSerialize: encode, responseDeserialize: decode } };
    const server = new grpc.Server();
    let client;
    try {
        server.addService(definition, { ping: (_call, callback) => callback(null, 'fixture') });
        await new Promise((resolve, reject) => server.bindAsync(target, grpc.ServerCredentials.createInsecure(), error => error ? reject(error) : resolve()));
        const Client = grpc.makeGenericClientConstructor(definition, 'Fixture');
        client = new Client(target, grpc.credentials.createInsecure());
        assert.equal(await new Promise((resolve, reject) => client.ping('ping', { deadline: Date.now() + 3000 },
            (error, response) => error ? reject(error) : resolve(response))), 'fixture');
    } finally {
        client?.close();
        server.forceShutdown();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('Xray API transport denies a different local uid while its owner can connect', {
    skip: process.platform !== 'linux' || process.getuid() !== 0,
}, async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'node-api-security-'));
    fs.chmodSync(directory, 0o700);
    const socketPath = path.join(directory, 'api.sock');
    const { XRAY_API_INBOUND_MODEL } = load(path.join(nodeSource, 'libs/contract/constants/xray/stats.ts'));
    const address = XRAY_API_INBOUND_MODEL({ xtlsApiSocketPath: socketPath }).listen;
    const transport = address.startsWith('@') ? '\0' + address.slice(1) : address.split(',')[0];
    const server = spawn('python3', ['-u', '-c', `
import json, socket, sys
s = socket.socket(socket.AF_UNIX)
s.bind(json.loads(sys.argv[1])); s.listen(2)
print('ready', flush=True)
while True:
    c, _ = s.accept(); c.sendall(b'fixture-control-response'); c.close()
`, JSON.stringify(transport)], { stdio: ['ignore', 'pipe', 'pipe'] });
    try {
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.once('exit', () => reject(new Error('fixture server exited')));
            server.stdout.once('data', () => resolve());
        });
        const childCode = `
import errno, json, socket, sys
s = socket.socket(socket.AF_UNIX); s.settimeout(2)
try:
    s.connect(json.loads(sys.argv[1])); print(s.recv(1024).decode(), end='')
except PermissionError:
    print('EACCES', end='')
        `;
        const request = (unprivileged) => new Promise((resolve, reject) => {
            const command = unprivileged ? 'setpriv' : 'python3';
            const args = unprivileged
                ? ['--reuid=65534', '--regid=65534', '--clear-groups', 'python3', '-c', childCode, JSON.stringify(transport)]
                : ['-c', childCode, JSON.stringify(transport)];
            const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
            let output = '', error = '';
            child.stdout.on('data', data => output += data);
            child.stderr.on('data', data => error += data);
            child.on('error', reject);
            child.on('exit', code => code === 0 ? resolve(output) : reject(new Error(error || `exit ${code}`)));
        });
        assert.equal(await request(false), 'fixture-control-response');
        assert.equal(await request(true), 'EACCES', 'local API must have filesystem access control');
    } finally {
        const exited = new Promise(resolve => server.once('exit', resolve));
        server.kill();
        await exited;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

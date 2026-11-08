const test = require('node:test');
require('reflect-metadata');
const assert = require('node:assert/strict');
const path = require('node:path');
const https = require('node:https');
const net = require('node:net');
const jwt = require('jsonwebtoken');
const load = require('./load-typescript.cjs');
const certRoot = path.join(__dirname, '../src/common/utils/certs');
const certificates = load(path.join(certRoot, 'generate-certs.util.ts'));
const sni = load(path.join(certRoot, 'generate-servername.util.ts'));
const { GetNodeHealthCheckCommand } = require('@remnawave/node-contract');
const errors = {
    INTERNAL_SERVER_ERROR: { code: 'INTERNAL', message: 'internal' },
    NODE_ERROR_WITH_MSG: { withMessage: message => ({ code: 'NODE_ERROR', message }) },
    NODE_ERROR_500_WITH_MSG: { withMessage: message => ({ code: 'NODE_500', message }) },
};
const { AxiosService } = load(path.join(__dirname, '../src/common/axios/axios.service.ts'), {
    '@common/config/app-config/typed-config.service': {},
    '@common/raw-cache': {},
    '@common/utils/bytes': { prettyBytesUtil: String },
    '@common/utils/certs': sni,
    '@common/utils/get-elapsed-time': { getTime: () => 0, formatExecutionTime: () => '' },
    '@common/utils/node-version': load(path.join(__dirname, '../src/common/utils/node-version.ts')),
    '@modules/keygen/commands/get-node-jwt': { GetNodeJwtCommand: class {} },
    '@contract/constants': { ERRORS: errors },
    '../types': { ok: response => ({ isOk: true, response }), fail: error => ({ isOk: false, ...error }) },
});

function memoryCache() {
    const values = new Map();
    return {
        async get(key) { const hit = values.get(key); return hit && hit.until > Date.now() ? hit.value : null; },
        async set(key, value, ttl) { values.set(key, { value, until: Date.now() + ttl * 1000 }); },
        async incrementWithTtl(key, ttl) { const next = (await this.get(key) ?? 0) + 1; await this.set(key, next, ttl); return next; },
    };
}
async function listen(server, host = '127.0.0.1', port = 0) {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
    return server.address().port;
}
async function close(server) {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
}

test('registered management routes retain real mTLS, JWT, SOCKS isolation and at-most-once dispatch', async t => {
    const master = await certificates.generateMasterCerts();
    const cert = await certificates.generateNodeCert(master.caCertPem, master.caKeyPem);
    const keys = await certificates.generateJwtKeypair();
    const token = jwt.sign({ fixture: 'control-route' }, keys.privateKey, { algorithm: 'RS256', expiresIn: '5m' });
    const expectedSni = sni.deriveSni(master.caCertPem, keys.publicKey);
    const requests = [];
    let invalidHealth = false;
    const server = https.createServer({ key: cert.nodeKeyPem, cert: cert.nodeCertPem, ca: master.caCertPem,
        requestCert: true, rejectUnauthorized: true, minVersion: 'TLSv1.3' }, (req, res) => {
        assert.equal(req.socket.authorized, true);
        assert.equal(req.socket.servername, expectedSni);
        const decoded = jwt.verify(req.headers.authorization.slice(7), keys.publicKey, { algorithms: ['RS256'] });
        assert.equal(decoded.fixture, 'control-route');
        requests.push({ method: req.method, path: req.url, ip: req.socket.localAddress });
        if (req.url === '/apply-and-disconnect') { req.resume(); req.once('end', () => res.destroy()); return; }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ response: req.url === GetNodeHealthCheckCommand.url
            ? { isAlive: invalidHealth ? 'true' : true, nodeVersion: '1.1.23' }
            : { accepted: true } }));
    });
    server.on('tlsClientError', () => {});
    const port = await listen(server);
    const services = [];
    const make = overrides => {
        const config = { uuid: '11111111-1111-4111-8111-111111111111', address: '127.0.0.2', port,
            proxyUrl: null, ips: [{ ip: '127.0.0.1', status: 'MANAGEMENT' }], ...overrides };
        const registry = { get: async () => config, isCurrent: async () => true };
        const service = new AxiosService({ execute: async () => ({ isOk: true, response: {
            jwtToken: token, jwtPublicKey: keys.publicKey, caCert: master.caCertPem,
            clientCert: master.clientCertPem, clientKey: master.clientKeyPem,
        } }) }, memoryCache(), { getOrThrow: () => true }, registry);
        services.push(service);
        return { config, service };
    };
    try {
        await t.test('refused primary selects authenticated reserve and concurrent commands share discovery', async () => {
            const { service, config } = make();
            const before = requests.length;
            const results = await Promise.all(Array.from({ length: 8 }, () => service.managedCore(config)));
            assert.ok(results.every(result => result.isOk));
            const sent = requests.slice(before);
            assert.equal(sent.filter(entry => entry.path === GetNodeHealthCheckCommand.url).length, 1);
            assert.equal(sent.filter(entry => entry.path === '/node/xray/managed-core').length, 8);
            const route = await service.connectionRoute(config);
            assert.equal(route.status, 'authenticated');
            assert.equal(route.activeAddress, '127.0.0.1');
            assert.equal(route.viaProxy, false);
        });
        await t.test('ambient HTTP proxy cannot intercept the node bearer token', async () => {
            let trapped = 0;
            const trap = net.createServer(socket => { trapped++; socket.destroy(); });
            const trapPort = await listen(trap);
            const previous = process.env.HTTPS_PROXY;
            process.env.HTTPS_PROXY = `http://127.0.0.1:${trapPort}`;
            try {
                const { service, config } = make({ address: '127.0.0.1', ips: [] });
                assert.equal((await service.managedCore(config)).isOk, true);
                assert.equal(trapped, 0);
            } finally {
                if (previous === undefined) delete process.env.HTTPS_PROXY; else process.env.HTTPS_PROXY = previous;
                await close(trap);
            }
        });
        await t.test('broken SOCKS never falls back to a direct connection or leaks its credentials', async () => {
            const proxy = net.createServer(socket => socket.once('data', () => socket.end(Buffer.from([5, 255]))));
            const proxyPort = await listen(proxy);
            const { service, config } = make({ address: '127.0.0.1', proxyUrl: `socks5://synthetic-user:synthetic-password@127.0.0.1:${proxyPort}`, ips: [] });
            const before = requests.length;
            try {
                assert.equal((await service.managedCore(config)).isOk, false);
                assert.equal(requests.length, before);
                const route = await service.connectionRoute(config);
                assert.equal(route.status, 'unavailable');
                assert.equal(route.viaProxy, true);
                assert.doesNotMatch(JSON.stringify(route), /synthetic-user|synthetic-password|socks5:/);
            } finally { await close(proxy); }
        });
        await t.test('the selected reserve keeps mTLS and JWT through a working SOCKS5 tunnel', async () => {
            const sockets = new Set();
            let tunnels = 0;
            const proxy = net.createServer(socket => {
                sockets.add(socket);
                socket.on('close', () => sockets.delete(socket));
                socket.on('error', () => {});
                let buffer = Buffer.alloc(0), stage = 0;
                const receive = chunk => {
                    buffer = Buffer.concat([buffer, chunk]);
                    if (stage === 0) {
                        if (buffer.length < 2 || buffer.length < 2 + buffer[1]) return;
                        assert.equal(buffer[0], 5);
                        buffer = buffer.subarray(2 + buffer[1]);
                        stage = 1;
                        socket.write(Buffer.from([5, 0]));
                    }
                    if (stage === 1 && buffer.length >= 10) {
                        assert.deepEqual([...buffer.subarray(0, 4)], [5, 1, 0, 1]);
                        const destination = [...buffer.subarray(4, 8)].join('.');
                        assert.equal(destination, '127.0.0.1');
                        assert.equal(buffer.readUInt16BE(8), port);
                        stage = 2;
                        socket.off('data', receive);
                        const upstream = net.connect(port, destination, () => {
                            tunnels++;
                            socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
                            if (buffer.length > 10) upstream.write(buffer.subarray(10));
                            socket.pipe(upstream).pipe(socket);
                        });
                        sockets.add(upstream);
                        upstream.on('close', () => { sockets.delete(upstream); socket.destroy(); });
                        upstream.on('error', () => socket.destroy());
                        socket.on('close', () => upstream.destroy());
                    }
                };
                socket.on('data', receive);
            });
            const proxyPort = await listen(proxy);
            const { service, config } = make({ address: '127.0.0.1', ips: [], proxyUrl: `socks5://127.0.0.1:${proxyPort}` });
            try {
                assert.equal((await service.managedCore(config)).isOk, true);
                assert.ok(tunnels >= 1);
                assert.equal((await service.connectionRoute(config)).viaProxy, true);
            } finally {
                for (const socket of sockets) socket.destroy();
                await close(proxy);
            }
        });
        await t.test('an untrusted certificate cannot receive an authenticated HTTP command', async () => {
            const foreign = await certificates.generateMasterCerts();
            const untrusted = await certificates.generateNodeCert(foreign.caCertPem, foreign.caKeyPem);
            let exposed = 0;
            const impostor = https.createServer({ key: untrusted.nodeKeyPem, cert: untrusted.nodeCertPem }, (_req, res) => { exposed++; res.end(); });
            impostor.on('tlsClientError', () => {});
            await listen(impostor, '127.0.0.2', port);
            try {
                const primaryOnly = make({ ips: [] });
                assert.equal((await primaryOnly.service.managedCore(primaryOnly.config)).isOk, false);
                assert.equal(exposed, 0);
                const { service, config } = make();
                assert.equal((await service.managedCore(config)).isOk, true);
                assert.equal(exposed, 0);
                assert.equal((await service.connectionRoute(config)).activeAddress, '127.0.0.1');
            } finally { await close(impostor); }
        });
        await t.test('an unverified health body never selects a fallback for a command', async () => {
            invalidHealth = true;
            const { service, config } = make();
            const before = requests.length;
            try {
                assert.equal((await service.managedCore(config)).isOk, false);
                assert.equal(requests.slice(before).filter(entry => entry.path !== GetNodeHealthCheckCommand.url).length, 0);
            } finally { invalidHealth = false; }
        });
        await t.test('a lost response after applying a mutation does not replay that mutation', async () => {
            const { service, config } = make({ address: '127.0.0.1', ips: [{ ip: '127.0.0.2', status: 'RESERVE' }] });
            const before = requests.length;
            const result = await service.request({ label: 'MUTATION TEST', opts: config,
                path: '/apply-and-disconnect', method: 'post', data: { revision: '1' }, timeout: 3000, logAxiosError: false });
            assert.equal(result.isOk, false);
            assert.equal(requests.slice(before).filter(entry => entry.path === '/apply-and-disconnect').length, 1);
        });
    } finally {
        for (const service of services) {
            service.axiosInstance.defaults.httpsAgent?.destroy();
            for (const agent of service.socksAgentCache.values()) agent.destroy();
        }
        await close(server);
    }
});

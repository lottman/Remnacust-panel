require('reflect-metadata');
const assert = require('node:assert/strict');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const { once } = require('node:events');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const load = require('./load-typescript.cjs');
const { MtlsSocksProxyAgent } = load(path.join(__dirname, '../src/common/axios/mtls-agent.ts'));
const dummyMtls = { ca: 'fixture-ca', cert: 'fixture-client-cert', key: 'fixture-client-key' };
const nodeToken = 'synthetic-node-token';

async function socksFixture(
    t,
    { mode = 'forward', targetPort, host = '127.0.0.1', reply = 5 } = {},
) {
    const clients = new Set(),
        sockets = new Set();
    const state = {
        connections: 0,
        greetings: 0,
        auth: [],
        destinations: [],
        granted: 0,
        bytes: [],
    };
    const server = net.createServer((socket) => {
        const index = state.connections++;
        clients.add(socket);
        sockets.add(socket);
        socket.on('close', () => {
            clients.delete(socket);
            sockets.delete(socket);
        });
        socket.on('error', () => {});
        let buffer = Buffer.alloc(0),
            stage = 0;
        const selectedMode = typeof mode === 'function' ? mode(index) : mode;
        const receive = (chunk) => {
            state.bytes.push(chunk);
            buffer = Buffer.concat([buffer, chunk]);
            if (stage === 0) {
                if (buffer.length < 2 || buffer.length < 2 + buffer[1]) return;
                assert.equal(buffer[0], 5);
                state.greetings++;
                if (selectedMode === 'stall-greeting') return;
                buffer = buffer.subarray(2 + buffer[1]);
                if (selectedMode === 'reject-greeting') {
                    stage = 4;
                    socket.write(Buffer.from([5, 255]));
                    return;
                }
                stage = 1;
                socket.write(Buffer.from([5, 2]));
            }
            if (stage === 1) {
                if (buffer.length < 2) return;
                const userLength = buffer[1],
                    passwordOffset = 2 + userLength;
                if (
                    buffer.length <= passwordOffset ||
                    buffer.length < passwordOffset + 1 + buffer[passwordOffset]
                )
                    return;
                const end = passwordOffset + 1 + buffer[passwordOffset];
                state.auth.push([
                    buffer.subarray(2, passwordOffset).toString(),
                    buffer.subarray(passwordOffset + 1, end).toString(),
                ]);
                buffer = buffer.subarray(end);
                if (selectedMode === 'stall-auth') return;
                if (selectedMode === 'reject-auth') {
                    stage = 4;
                    socket.write(Buffer.from([1, 1]));
                    return;
                }
                stage = 2;
                socket.write(Buffer.from([1, 0]));
            }
            if (stage === 2) {
                if (buffer.length < 5) return;
                const addressLength = buffer[3] === 1 ? 4 : buffer[3] === 4 ? 16 : buffer[4] + 1;
                const end = 4 + addressLength + 2;
                if (buffer.length < end) return;
                const destination =
                    buffer[3] === 1
                        ? [...buffer.subarray(4, 8)].join('.')
                        : buffer[3] === 3
                          ? buffer.subarray(5, 4 + addressLength).toString()
                          : buffer.subarray(4, 20).toString('hex');
                state.destinations.push({ host: destination, port: buffer.readUInt16BE(end - 2) });
                if (selectedMode === 'stall-connect') return;
                stage = 3;
                if (selectedMode === 'reject-connect') {
                    socket.write(Buffer.from([5, reply, 0, 1, 127, 0, 0, 1, 0, 0]));
                    return;
                }
                if (selectedMode === 'stall-tls') {
                    state.granted++;
                    socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
                    buffer = Buffer.alloc(0);
                    return;
                }
                assert.equal(buffer.readUInt16BE(end - 2), targetPort);
                const upstream = net.connect({ host: '127.0.0.1', port: targetPort }, () => {
                    state.granted++;
                    socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
                    socket.off('data', receive);
                    if (buffer.length > end) upstream.write(buffer.subarray(end));
                    socket.pipe(upstream).pipe(socket);
                });
                sockets.add(upstream);
                upstream.on('error', () => socket.destroy());
                upstream.on('close', () => {
                    sockets.delete(upstream);
                    socket.destroy();
                });
                socket.on('close', () => upstream.destroy());
            }
        };
        socket.on('data', receive);
    });
    const port = await listen(server, host);
    t.after(async () => {
        for (const socket of sockets) socket.destroy();
        await new Promise((resolve) => server.close(resolve));
    });
    return { server, state, clients, port, host };
}

function agentFor(t, proxy, mtls = dummyMtls) {
    const address = proxy.host.includes(':') ? `[${proxy.host}]` : proxy.host;
    const agent = new MtlsSocksProxyAgent(
        `socks5://synthetic-user:synthetic-password@${address}:${proxy.port}`,
        mtls,
        'node.example.test',
    );
    t.after(() => agent.destroy());
    return agent;
}

function get(agent, options = {}, onRequest = () => {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(
            {
                protocol: 'https:',
                hostname: '127.0.0.1',
                port: 443,
                agent,
                headers: { Authorization: 'Bearer ' + nodeToken },
                ...options,
            },
            (response) => {
                let body = '';
                response.on('data', (chunk) => {
                    body += chunk;
                });
                response.once('error', reject);
                response.once('end', () =>
                    resolve({
                        status: response.statusCode,
                        body,
                        socket: response.socket,
                        reused: req.reusedSocket,
                    }),
                );
            },
        );
        req.once('error', reject);
        onRequest(req);
    });
}

function noSecrets(error) {
    assert.doesNotMatch(
        JSON.stringify(error),
        /synthetic-user|synthetic-password|synthetic-node-token|fixture-client-key/,
    );
}

let credentials;
async function realCredentials() {
    if (!credentials)
        credentials = (async () => {
            const certificates = load(
                path.join(__dirname, '../src/common/utils/certs/generate-certs.util.ts'),
            );
            const master = await certificates.generateMasterCerts();
            const leaf = await certificates.generateNodeCert(master.caCertPem, master.caKeyPem);
            return {
                master,
                leaf,
                mtls: {
                    ca: master.caCertPem,
                    cert: master.clientCertPem,
                    key: master.clientKeyPem,
                },
            };
        })();
    return credentials;
}

async function nodeFixture(t, material) {
    const { master, leaf } = material;
    const state = { connections: 0, requests: 0 };
    const sockets = new Set();
    const server = https.createServer(
        {
            ca: master.caCertPem,
            key: leaf.nodeKeyPem,
            cert: leaf.nodeCertPem,
            requestCert: true,
            rejectUnauthorized: true,
            minVersion: 'TLSv1.3',
        },
        (request, response) => {
            assert.equal(request.socket.authorized, true);
            assert.equal(request.socket.servername, 'node.example.test');
            assert.equal(request.socket.getProtocol(), 'TLSv1.3');
            assert.equal(request.headers.authorization, 'Bearer ' + nodeToken);
            assert.equal(request.headers.nodecontrolsignal, undefined);
            state.requests++;
            response.end('authenticated node');
        },
    );
    server.on('connection', (socket) => {
        state.connections++;
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
    });
    server.on('tlsClientError', () => {});
    const port = await listen(server);
    t.after(async () => {
        for (const socket of sockets) socket.destroy();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    });
    return { state, port };
}

async function listen(server, host = '127.0.0.1') {
    server.listen(0, host);
    await once(server, 'listening');
    return server.address().port;
}
async function waitFor(check, message, timeout = 500) {
    const deadline = performance.now() + timeout;
    while (performance.now() < deadline) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.fail(message);
}

test('40ms request abort closes an actual in-flight SOCKS handshake and never sends node credentials', async (t) => {
    const sockets = new Set(),
        captured = [];
    let targetConnections = 0;
    const target = net.createServer((socket) => {
        targetConnections++;
        socket.destroy();
    });
    const targetPort = await listen(target);
    const proxy = net.createServer((socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => {});
        socket.on('data', (bytes) => captured.push(bytes));
    });
    const proxyPort = await listen(proxy);
    const agent = new MtlsSocksProxyAgent(
        `socks5://synthetic-user:synthetic-password@127.0.0.1:${proxyPort}`,
        { ca: 'fixture-ca', cert: 'fixture-client-cert', key: 'fixture-client-key' },
        'node.example.test',
    );
    t.after(async () => {
        agent.destroy();
        for (const socket of sockets) socket.destroy();
        await Promise.all([
            new Promise((resolve) => proxy.close(resolve)),
            new Promise((resolve) => target.close(resolve)),
        ]);
    });
    const signal = AbortSignal.timeout(40);
    const result = new Promise((resolve, reject) => {
        const req = https.get(
            {
                hostname: '127.0.0.1',
                port: targetPort,
                agent,
                signal,
                nodeControlSignal: signal,
                headers: { Authorization: 'Bearer synthetic-node-token' },
            },
            (response) => {
                response.resume();
                reject(new Error('Node HTTP must not be reached'));
            },
        );
        req.once('error', resolve);
    });
    if (!signal.aborted) await once(signal, 'abort');
    assert(captured.length, 'the real SOCKS greeting must have reached the proxy');
    await waitFor(
        () => sockets.size === 0,
        'the cancelled SOCKS handshake retained a live proxy socket',
    );
    const error = await result;
    assert.equal(error.code, 'ABORT_ERR');
    assert.equal(targetConnections, 0);
    const traffic = Buffer.concat(captured).toString('latin1');
    assert.doesNotMatch(
        traffic,
        /Authorization|synthetic-node-token|fixture-client-key|fixture-client-cert/,
    );
});

for (const mode of ['stall-auth', 'stall-connect'])
    test(`40ms signal cancels the actual ${mode} stage and drains pending admission`, async (t) => {
        const proxy = await socksFixture(t, { mode }),
            agent = agentFor(t, proxy);
        const signal = AbortSignal.timeout(40);
        const result = get(agent, { signal, nodeControlSignal: signal }).catch((error) => error);
        const error = await result;
        assert.equal(error.code, 'ABORT_ERR');
        assert.equal(proxy.state.greetings, 1);
        assert.equal(proxy.state.auth.length, 1);
        if (mode === 'stall-connect') assert.equal(proxy.state.destinations.length, 1);
        await waitFor(
            () => proxy.clients.size === 0 && agent.pendingHandshakes.size === 0,
            'cancelled handshake did not settle and close',
        );
        assert.equal(agent.totalSocketCount, 0);
        noSecrets(error);
    });

test(
    'the default handshake deadline closes a stalled socket even without a custom signal',
    { timeout: 8000 },
    async (t) => {
        const proxy = await socksFixture(t, { mode: 'stall-greeting' }),
            agent = agentFor(t, proxy);
        const started = performance.now();
        const error = await get(agent).catch((error) => error);
        assert.equal(error.code, 'ETIMEDOUT');
        assert(
            performance.now() - started < 6200,
            'SOCKS must not retain its old 30-second default',
        );
        await waitFor(
            () => proxy.clients.size === 0 && agent.pendingHandshakes.size === 0,
            'deadline did not cancel the owned socket',
        );
        noSecrets(error);
    },
);

test('request abort and close without a custom signal cancel only pending handshakes', async (t) => {
    for (const event of ['abort', 'close']) {
        const proxy = await socksFixture(t, { mode: 'stall-greeting' }),
            agent = agentFor(t, proxy);
        const req = new EventEmitter();
        req.destroyed = false;
        const pending = agent
            .connect(req, { host: '127.0.0.1', port: 443, secureEndpoint: false })
            .catch((error) => error);
        await waitFor(() => proxy.state.greetings === 1, 'SOCKS greeting did not arrive');
        req.emit(event);
        assert.equal((await pending).code, 'ABORT_ERR');
        await waitFor(
            () => proxy.clients.size === 0 && agent.pendingHandshakes.size === 0,
            'request close retained a pending socket',
        );
        assert.equal(req.listenerCount('close'), 0);
        assert.equal(req.listenerCount('abort'), 0);
    }
});

test('agent destruction cancels concurrent owned handshakes and refuses any later connect', async (t) => {
    const proxy = await socksFixture(t, { mode: 'stall-greeting' }),
        agent = agentFor(t, proxy);
    const pending = [get(agent).catch((error) => error), get(agent).catch((error) => error)];
    await waitFor(() => proxy.state.greetings === 2, 'concurrent SOCKS handshakes did not start');
    assert.equal(agent.pendingHandshakes.size, 2);
    agent.destroy();
    assert((await Promise.all(pending)).every((error) => error.code === 'ABORT_ERR'));
    await waitFor(
        () => proxy.clients.size === 0 && agent.pendingHandshakes.size === 0,
        'destroy left unregistered handshake sockets alive',
    );
    assert.equal((await get(agent).catch((error) => error)).code, 'ABORT_ERR');
    assert.equal(proxy.state.connections, 2);
});

test('cancelled target DNS never creates a socket even when the resolver eventually replies', async (t) => {
    const proxy = await socksFixture(t, { mode: 'stall-greeting' }),
        agent = agentFor(t, proxy);
    let complete;
    const signal = AbortSignal.timeout(40);
    const error = await get(agent, {
        hostname: 'pending-node.example.test',
        signal,
        nodeControlSignal: signal,
        lookup: (_host, _options, done) => {
            complete = done;
        },
    }).catch((error) => error);
    assert.equal(error.code, 'ABORT_ERR');
    assert.equal(typeof complete, 'function');
    complete(null, '127.0.0.1', 4);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(proxy.state.connections, 0);
    assert.equal(agent.pendingHandshakes.size, 0);
});

test('cancelled proxy DNS destroys its owned socket and cannot dial after a late DNS reply', async (t) => {
    const proxy = await socksFixture(t, { mode: 'stall-greeting' });
    const agent = agentFor(t, { ...proxy, host: 'pending-proxy.example.test' });
    let complete, lookupOptions;
    agent.socketOptions = {
        lookup: (_host, options, done) => {
            complete = done;
            lookupOptions = options;
        },
    };
    const signal = AbortSignal.timeout(40);
    const error = await get(agent, { signal, nodeControlSignal: signal }).catch((error) => error);
    assert.equal(error.code, 'ABORT_ERR');
    assert.equal(typeof complete, 'function');
    complete(null, lookupOptions.all ? [{ address: '127.0.0.1', family: 4 }] : '127.0.0.1', 4);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(proxy.state.connections, 0);
    assert.equal(agent.pendingHandshakes.size, 0);
});

for (const [mode, reply, expected] of [
    ['reject-greeting', 0, 'NODE_PROXY_UNAVAILABLE'],
    ['reject-auth', 0, 'NODE_PROXY_UNAVAILABLE'],
    ['reject-connect', 5, 'ECONNREFUSED'],
    ['reject-connect', 3, 'ENETUNREACH'],
    ['reject-connect', 4, 'EHOSTUNREACH'],
])
    test(`${mode}/${reply} preserves the distinction between proxy failure and a refused target`, async (t) => {
        const proxy = await socksFixture(t, { mode, reply }),
            agent = agentFor(t, proxy);
        const error = await get(agent).catch((error) => error);
        assert.equal(error.code, expected);
        noSecrets(error);
        await waitFor(
            () => proxy.clients.size === 0 && agent.pendingHandshakes.size === 0,
            'failed handshake socket did not close',
        );
    });

test('proxy DNS and TCP refusal are proxy failures while a target DNS error stays a target failure', async (t) => {
    const proxy = await socksFixture(t, { mode: 'stall-greeting' });
    const proxyDns = agentFor(t, { ...proxy, host: 'missing-proxy.example.test' });
    proxyDns.socketOptions = {
        lookup: (_host, _options, done) =>
            done(Object.assign(new Error('fixture DNS failure'), { code: 'ENOTFOUND' })),
    };
    const dnsError = await get(proxyDns).catch((error) => error);
    assert.equal(dnsError.code, 'NODE_PROXY_UNAVAILABLE');
    noSecrets(dnsError);
    const reservation = net.createServer(),
        refusedPort = await listen(reservation);
    await new Promise((resolve) => reservation.close(resolve));
    const refused = agentFor(t, { host: '127.0.0.1', port: refusedPort });
    assert.equal((await get(refused).catch((error) => error)).code, 'NODE_PROXY_UNAVAILABLE');
    const targetDns = agentFor(t, proxy);
    const targetError = await get(targetDns, {
        hostname: 'missing-node.example.test',
        lookup: (_host, _options, done) =>
            done(Object.assign(new Error('fixture target DNS failure'), { code: 'ENOTFOUND' })),
    }).catch((error) => error);
    assert.equal(targetError.code, 'ENOTFOUND');
    assert.equal(proxy.state.connections, 0);
});

for (const cancel of [true, false])
    test(`${cancel ? '40ms abort' : 'bounded timeout'} closes the actual pending TLS upgrade`, async (t) => {
        const { mtls } = await realCredentials();
        const proxy = await socksFixture(t, { mode: 'stall-tls' }),
            agent = agentFor(t, proxy, mtls);
        if (!cancel) agent.timeout = 100;
        const signal = cancel ? AbortSignal.timeout(40) : undefined;
        const error = await get(agent, { signal, nodeControlSignal: signal }).catch(
            (error) => error,
        );
        assert.equal(error.code, cancel ? 'ABORT_ERR' : 'ETIMEDOUT');
        assert.equal(proxy.state.granted, 1);
        assert(
            proxy.state.bytes.some((bytes) => bytes[0] === 22 && bytes.length > 50),
            'an actual TLS ClientHello must enter the tunnel',
        );
        await waitFor(
            () => proxy.clients.size === 0 && agent.pendingHandshakes.size === 0,
            'TLS cancellation left the proxy TCP socket alive',
        );
        assert.doesNotMatch(
            Buffer.concat(proxy.state.bytes).toString('latin1'),
            /Authorization|synthetic-node-token|BEGIN (?:EC )?PRIVATE KEY/,
        );
        noSecrets(error);
    });

test('a cancelled concurrent handshake cannot kill an authenticated mTLS tunnel or its later keep-alive reuse', async (t) => {
    const material = await realCredentials(),
        target = await nodeFixture(t, material);
    const proxy = await socksFixture(t, {
        targetPort: target.port,
        mode: (index) => (index === 0 ? 'stall-greeting' : 'forward'),
    });
    const agent = agentFor(t, proxy, material.mtls);
    const stopped = AbortSignal.timeout(80);
    const cancelledRequest = get(agent, {
        port: target.port,
        signal: stopped,
        nodeControlSignal: stopped,
    }).catch((error) => error);
    await waitFor(() => proxy.state.greetings === 1, 'first concurrent handshake did not start');
    const completed = AbortSignal.timeout(250);
    let request;
    const successful = await get(
        agent,
        { port: target.port, signal: completed, nodeControlSignal: completed },
        (req) => {
            request = req;
        },
    );
    const originalDestroy = request.destroy;
    assert.equal(successful.status, 200);
    assert.equal(successful.body, 'authenticated node');
    assert.equal((await cancelledRequest).code, 'ABORT_ERR');
    if (!completed.aborted) await once(completed, 'abort');
    await new Promise((resolve) => setTimeout(resolve, 20));
    const repeated = await get(agent, { port: target.port });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.reused, true);
    assert.equal(request.destroy, originalDestroy);
    assert.equal(proxy.state.connections, 2);
    assert.equal(target.state.connections, 1);
    assert.equal(target.state.requests, 2);
    assert.deepEqual(proxy.state.auth, [['synthetic-user', 'synthetic-password']]);
    assert.equal(agent.pendingHandshakes.size, 0);
    assert.doesNotMatch(
        Buffer.concat(proxy.state.bytes).toString('latin1'),
        /Authorization|synthetic-node-token|BEGIN (?:EC )?PRIVATE KEY/,
    );
});

test('an untrusted node certificate through SOCKS cannot receive authenticated HTTP', async (t) => {
    const trusted = await realCredentials();
    const certificates = load(
        path.join(__dirname, '../src/common/utils/certs/generate-certs.util.ts'),
    );
    const master = await certificates.generateMasterCerts();
    const leaf = await certificates.generateNodeCert(master.caCertPem, master.caKeyPem);
    const target = await nodeFixture(t, { master, leaf });
    const proxy = await socksFixture(t, { targetPort: target.port }),
        agent = agentFor(t, proxy, trusted.mtls);
    const error = await get(agent, { port: target.port }).catch((error) => error);
    assert.match(error.code, /CERT|VERIFY|ISSUER|SELF_SIGNED/);
    assert.notEqual(error.code, 'NODE_PROXY_UNAVAILABLE');
    assert.equal(target.state.requests, 0);
    await waitFor(
        () => proxy.clients.size === 0 && agent.pendingHandshakes.size === 0,
        'failed private-CA validation retained its tunnel',
    );
    noSecrets(error);
});

test('an actual IPv6 SOCKS endpoint preserves the same mTLS tunnel and SNI', async (t) => {
    const material = await realCredentials(),
        target = await nodeFixture(t, material);
    const proxy = await socksFixture(t, { targetPort: target.port, host: '::1' });
    const probe = net.connect({ host: '::1', port: proxy.port });
    try {
        await once(probe, 'connect');
    } catch (error) {
        if (process.platform === 'win32' && error.code === 'EACCES') {
            t.skip('Windows denies raw IPv6 loopback TCP; Linux must execute the IPv6 proxy test');
            return;
        }
        throw error;
    } finally {
        probe.destroy();
    }
    const agent = agentFor(t, proxy, material.mtls);
    assert.equal((await get(agent, { port: target.port })).status, 200);
    assert.equal(target.state.requests, 1);
    assert.deepEqual(proxy.state.auth, [['synthetic-user', 'synthetic-password']]);
});

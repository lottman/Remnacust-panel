const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { source } = require('./upstream-filter-fixture.cjs');
const { ensureResponseTimeProbes } = source('modules/subscription-template/generators/response-time-probes.ts');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        if (await check()) return;
        await pause(25);
    }
    throw new Error('Timed out: ' + label);
}
async function listen(server) {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return server.address().port;
}
function proxy(name, handshake, response) {
    const state = { handshake, response, fail: false, probes: 0, methods: new Set() };
    const sockets = new Set();
    const origin = http.createServer((request, reply) => {
        if (request.url === '/probe') {
            state.probes++;
            state.methods.add(request.method);
        }
        const timer = setTimeout(() => {
            if (state.fail) return reply.destroy();
            if (request.url === '/probe') reply.writeHead(204).end();
            else reply.end(name);
        }, state.response);
        reply.on('close', () => clearTimeout(timer));
    });
    const server = http.createServer();
    server.on('connection', socket => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => {});
    });
    server.on('connect', (request, socket, head) => {
        const timer = setTimeout(() => {
            if (socket.destroyed) return;
            socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            if (head.length) socket.unshift(head);
            origin.emit('connection', socket);
        }, state.handshake);
        socket.on('close', () => clearTimeout(timer));
    });
    return { state, server, close: async () => {
        for (const socket of sockets) socket.destroy();
        await new Promise(resolve => server.close(resolve));
        origin.closeAllConnections();
    }};
}
function request(port) {
    return new Promise((resolve, reject) => {
        const req = http.get({ hostname: '127.0.0.1', port, path: 'http://route.test/chosen',
            headers: { Host: 'route.test', Connection: 'close' }, agent: false, timeout: 2500 }, response => {
            let data = '';
            response.on('data', part => data += part);
            response.on('end', () => response.statusCode === 200 ? resolve(data) : reject(new Error('HTTP ' + response.statusCode)));
            response.on('error', reject);
        });
        req.on('timeout', () => req.destroy(new Error('Request timeout')));
        req.on('error', reject);
    });
}

async function main() {
    const binary = process.env.REMNACUST_AUTOPROBE_CORE;
    assert(binary && path.isAbsolute(binary) && fs.existsSync(binary), 'Set REMNACUST_AUTOPROBE_CORE to an owned native Xray executable');
    const slow = proxy('slow', 5, 350);
    const fast = proxy('fast', 60, 5);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-time-'));
    const burst = process.argv.includes('--burst');
    let core;
    let log = '';
    try {
        const ports = [await listen(slow.server), await listen(fast.server)];
        const reservation = net.createServer();
        const port = await listen(reservation);
        await new Promise(resolve => reservation.close(resolve));
        const config = ensureResponseTimeProbes({
            log: { loglevel: 'warning' },
            inbounds: [{ tag: 'client', listen: '127.0.0.1', port, protocol: 'http' }],
            outbounds: ports.map((port, index) => ({ tag: 'pool-' + index, protocol: 'http',
                settings: { servers: [{ address: '127.0.0.1', port }] } })),
            routing: { rules: [{ type: 'field', inboundTag: ['client'], balancerTag: 'auto' }],
                balancers: [{ tag: 'auto', selector: ['pool-'], strategy: { type: 'leastPing' } }] },
            ...(burst
                ? { burstObservatory: { pingConfig: { destination: 'http://probe.test/probe', interval: '10s' } } }
                : { observatory: { probeURL: 'http://probe.test/probe', probeInterval: '200ms', enableConcurrency: true } }),
        });
        assert.deepEqual(config[burst ? 'burstObservatory' : 'observatory'].subjectSelector, ['pool-']);
        const filename = path.join(directory, 'config.json');
        fs.writeFileSync(filename, JSON.stringify(config), { mode: 0o600 });
        core = spawn(binary, ['run', '-config', filename], { stdio: ['ignore', 'pipe', 'pipe'] });
        const collect = part => { log = (log + part).slice(-6000); };
        core.stdout.on('data', collect);
        core.stderr.on('data', collect);
        await waitFor(() => slow.state.probes > 0 && fast.state.probes > 0, 'both actual outbound probes');
        await waitFor(async () => {
            try { return await request(port) === 'fast'; } catch { return false; }
        }, 'higher handshake delay but lower HTTP response time wins');
        for (let i = 0; i < 4; i++) assert.equal(await request(port), 'fast');
        assert.deepEqual([...slow.state.methods], [burst ? 'HEAD' : 'GET']);
        assert.deepEqual([...fast.state.methods], [burst ? 'HEAD' : 'GET']);
        if (burst) {
            console.log('PASS native Xray burst HTTP probes: default HEAD uses the real response time through each outbound');
            return;
        }
        slow.state.response = 5;
        fast.state.response = 350;
        await waitFor(async () => {
            try { return await request(port) === 'slow'; } catch { return false; }
        }, 'new connections switch after response time changes without refreshing the subscription');
        slow.state.fail = true;
        fast.state.response = 5;
        await waitFor(async () => {
            try { return await request(port) === 'fast'; } catch { return false; }
        }, 'failed selected server is excluded by a real HTTP probe');
        for (let i = 0; i < 3; i++) assert.equal(await request(port), 'fast');
        assert.equal(core.exitCode, null, 'core must remain running');
        console.log('PASS native Xray HTTP probes: a fast connection with slow response loses; changed response times switch new connections without a subscription refresh');
    } catch (error) {
        error.message += '\n' + log;
        throw error;
    } finally {
        if (core && core.exitCode === null) {
            const stopped = once(core, 'exit');
            core.kill();
            await stopped;
        }
        await slow.close();
        await fast.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

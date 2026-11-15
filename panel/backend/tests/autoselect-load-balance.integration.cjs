const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const test = require('node:test');
const { source } = require('./upstream-filter-fixture.cjs');
const { regex } = require('./client-pool-fixture.cjs');
const { XrayJsonGeneratorService } = source(
    'modules/subscription-template/generators/xray-json.generator.service.ts',
    {
        './inject-host-selection': source(
            'modules/subscription-template/generators/inject-host-selection.ts',
        ),
        '@common/utils/bounded-regex': regex,
        '@common/utils': { isNonEmptyObject: (value) => !!value && Object.keys(value).length > 0 },
        '../host-mapper': { applyHostMapper: (value) => value },
    },
);

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const userId = '20000000-0000-4000-8000-000000000001';
test.after(() => regex.configuredRegex.close());

async function listen(server, address = '127.0.0.1') {
    server.listen(0, address);
    await once(server, 'listening');
    return server.address().port;
}

function origin(name) {
    const state = { name, fail: false, probes: 0, failedProbes: 0, chosen: 0, streams: 0 };
    const sockets = new Set();
    const server = http.createServer((request, response) => {
        if (request.url === '/probe') {
            state.probes++;
            if (state.fail) {
                state.failedProbes++;
                return response.destroy();
            }
            return response.writeHead(204).end();
        }
        if (request.url === '/stream') {
            state.streams++;
            response.writeHead(200, { 'Content-Type': 'text/plain' });
            let sequence = 0;
            response.write(`${name}:${sequence++}\n`);
            const timer = setInterval(() => response.write(`${name}:${sequence++}\n`), 40);
            response.on('close', () => clearInterval(timer));
            return;
        }
        assert.equal(request.url, '/chosen');
        state.chosen++;
        if (state.fail) return response.destroy();
        response.end(name);
    });
    server.on('connection', (socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => {});
    });
    return {
        state,
        server,
        async close() {
            for (const socket of sockets) socket.destroy();
            if (server.listening) await new Promise((resolve) => server.close(resolve));
        },
    };
}

function request(port) {
    return new Promise((resolve, reject) => {
        const outgoing = http.get(
            {
                hostname: '127.0.0.1',
                port,
                path: 'http://route.test/chosen',
                headers: { Host: 'route.test', Connection: 'close' },
                agent: false,
                timeout: 2500,
            },
            (response) => {
                let body = '';
                response.on('data', (part) => {
                    body += part;
                });
                response.on('error', reject);
                response.on('end', () =>
                    response.statusCode === 200
                        ? resolve(body)
                        : reject(new Error(`HTTP ${response.statusCode}`)),
                );
            },
        );
        outgoing.on('timeout', () => outgoing.destroy(new Error('Request timeout')));
        outgoing.on('error', reject);
    });
}

function openStream(port) {
    return new Promise((resolve, reject) => {
        const state = { lines: [], closed: false, error: null };
        const outgoing = http.get(
            {
                hostname: '127.0.0.1',
                port,
                path: 'http://route.test/stream',
                headers: { Host: 'route.test', Connection: 'close' },
                agent: false,
                timeout: 2500,
            },
            (response) => {
                if (response.statusCode !== 200) {
                    response.destroy();
                    return reject(new Error(`Stream HTTP ${response.statusCode}`));
                }
                let buffered = '';
                response.on('data', (part) => {
                    buffered += part;
                    while (buffered.includes('\n')) {
                        const end = buffered.indexOf('\n');
                        state.lines.push(buffered.slice(0, end));
                        buffered = buffered.slice(end + 1);
                    }
                    if (state.lines.length)
                        resolve({
                            state,
                            response,
                            socket: response.socket,
                            close: () => outgoing.destroy(),
                        });
                });
                response.on('error', (error) => {
                    state.error = error;
                    reject(error);
                });
                response.on('close', () => {
                    state.closed = true;
                });
            },
        );
        outgoing.on('timeout', () => outgoing.destroy(new Error('Stream timeout')));
        outgoing.on('error', (error) => {
            state.error = error;
            reject(error);
        });
    });
}

function resolvedHost(n, address, port, hidden = true) {
    return {
        protocol: 'vless',
        address,
        port,
        protocolOptions: { id: userId, flow: '' },
        transport: 'tcp',
        transportOptions: {},
        security: 'none',
        securityOptions: {},
        streamOverrides: {},
        mux: null,
        finalRemark: `source-${n}`,
        clientOverrides: { mapper: { xrayJson: null } },
        metadata: {
            uuid: id(n),
            tags: ['runtime'],
            isHidden: hidden,
            excludeFromSubscriptionTypes: [],
        },
    };
}

async function runtime(t, family) {
    const binary = process.env.REMNACUST_AUTOPROBE_CORE;
    assert(
        binary && path.isAbsolute(binary) && fs.existsSync(binary),
        'Set REMNACUST_AUTOPROBE_CORE to an owned native Xray executable',
    );
    const version = spawnSync(binary, ['version'], {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
    });
    assert.ifError(version.error);
    assert.equal(version.status, 0, version.stdout + version.stderr);
    t.diagnostic(version.stdout.split(/\r?\n/)[0]);
    const address = family === 6 ? '::1' : '127.0.0.1';
    const origins = ['alpha', 'beta', 'failed', 'unauthorized', 'excluded', 'manual'].map(origin);
    origins[2].state.fail = true;
    const reservations = [];
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'autoselect-load-balance-'));
    let core,
        stream,
        log = '';
    try {
        if (family === 6) {
            const probe = net.createServer((socket) => socket.end());
            reservations.push(probe);
            const port = await listen(probe, address);
            const socket = net.connect({ host: address, port });
            socket.on('error', () => {});
            try {
                await once(socket, 'connect');
            } finally {
                socket.destroy();
            }
            await new Promise((resolve) => probe.close(resolve));
        }
        const originPorts = [];
        for (const item of origins) originPorts.push(await listen(item.server));
        const ports = [];
        for (let n = 0; n < 7; n++) {
            const reservation = net.createServer();
            reservations.push(reservation);
            ports.push(await listen(reservation, n >= 2 ? address : '127.0.0.1'));
        }
        const [clientPort, manualPort, ...sourcePorts] = ports;
        const manual = {
            tag: 'manual-balance',
            selector: ['manual-out'],
            fallbackTag: 'manual-out',
            strategy: {
                type: 'leastLoad',
                settings: {
                    expected: 1,
                    tolerance: 0.05,
                    maxRTT: '2s',
                    baselines: ['100ms'],
                    costs: [{ match: 'manual-out', value: 0.5 }],
                },
            },
        };
        const redirect = (n) => ({
            tag: `origin-${n}`,
            protocol: 'freedom',
            settings: {
                redirect: `127.0.0.1:${originPorts[n]}`,
                finalRules: [
                    {
                        action: 'allow',
                        network: 'tcp',
                        port: String(originPorts[n]),
                        ip: ['127.0.0.1/32'],
                    },
                ],
            },
        });
        const template = {
            log: { loglevel: 'info' },
            inbounds: [
                { tag: 'client', listen: '127.0.0.1', port: clientPort, protocol: 'http' },
                { tag: 'manual-client', listen: '127.0.0.1', port: manualPort, protocol: 'http' },
                ...sourcePorts.map((port, n) => ({
                    tag: `node-${n}`,
                    listen: address,
                    port,
                    protocol: 'vless',
                    settings: { clients: [{ id: userId }], decryption: 'none' },
                })),
            ],
            outbounds: [
                { ...redirect(5), tag: 'manual-out' },
                ...sourcePorts.map((_, n) => redirect(n)),
            ],
            observatory: {
                probeURL: 'http://probe.test/probe',
                probeInterval: '100ms',
                enableConcurrency: true,
            },
            routing: {
                balancers: [
                    {
                        tag: 'auto',
                        selector: ['pool'],
                        strategy: { type: 'roundRobin', settings: { remnacustLoadBalance: true } },
                    },
                    manual,
                ],
                rules: [
                    ...sourcePorts.map((_, n) => ({
                        type: 'field',
                        inboundTag: [`node-${n}`],
                        outboundTag: `origin-${n}`,
                    })),
                    { type: 'field', inboundTag: ['manual-client'], balancerTag: 'manual-balance' },
                    { type: 'field', inboundTag: ['client'], balancerTag: 'auto' },
                ],
            },
            remnawave: {
                injectHosts: [
                    {
                        mode: 'all',
                        selectFrom: 'HIDDEN',
                        tagPrefix: 'pool',
                        addressFamily: family === 6 ? 'ipv6' : 'ipv4',
                        selector: {
                            type: 'uuids',
                            values: sourcePorts.map((_, n) => id(n + 1)).concat(id(999)),
                        },
                    },
                ],
            },
        };
        const before = structuredClone(template);
        const available = sourcePorts.map((port, n) => resolvedHost(n + 1, address, port));
        available[4].metadata.excludeFromSubscriptionTypes = ['XRAY_JSON'];
        const authorized = [available[0], available[1], available[2], available[4]];
        const generator = new XrayJsonGeneratorService({
            getCachedTemplateByType: async () => template,
        });
        const configs = JSON.parse(
            await generator.generateConfig({
                hosts: [resolvedHost(0, '127.0.0.1', 1, false), ...authorized],
                isExtendedClient: false,
            }),
        );
        assert.equal(configs.length, 1);
        const config = configs[0],
            balance = config.routing.balancers.find((item) => item.tag === 'auto');
        assert.deepEqual(
            template,
            before,
            'the saved template and manual settings remain untouched',
        );
        assert.deepEqual(
            config.routing.balancers.find((item) => item.tag === manual.tag),
            manual,
        );
        assert.deepEqual(balance.strategy, { type: 'roundRobin' });
        assert.equal(
            config.outbounds.find((item) => item.tag === balance.fallbackTag).protocol,
            'blackhole',
        );
        assert.deepEqual(
            config.outbounds
                .filter((item) => /^pool(?:-\d+)?$/.test(item.tag))
                .map((item) => item.settings.vnext[0].address),
            Array(3).fill(address),
        );
        assert.deepEqual(
            config.outbounds
                .filter((item) => /^pool(?:-\d+)?$/.test(item.tag))
                .map((item) => item.settings.vnext[0].port),
            sourcePorts.slice(0, 3),
        );
        assert.equal(config.remnawave, undefined);
        const filename = path.join(directory, 'config.json');
        fs.writeFileSync(filename, JSON.stringify(config), { mode: 0o600 });
        const validation = spawnSync(binary, ['run', '-test', '-config', filename], {
            encoding: 'utf8',
            timeout: 5000,
            maxBuffer: 65536,
            windowsHide: true,
        });
        assert.ifError(validation.error);
        assert.equal(validation.status, 0, validation.stdout + validation.stderr);
        for (const reservation of reservations)
            if (reservation.listening) await new Promise((resolve) => reservation.close(resolve));
        core = spawn(binary, ['run', '-config', filename], {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        const collect = (part) => {
            log = (log + part).slice(-16000);
        };
        core.stdout.on('data', collect);
        core.stderr.on('data', collect);
        await once(core, 'spawn');
        const waitFor = async (check, label) => {
            const deadline = Date.now() + 15000;
            while (Date.now() < deadline) {
                assert.equal(core.exitCode, null, `native Core exited: ${log}`);
                if (await check()) return;
                await pause(25);
            }
            throw new Error('Timed out: ' + label);
        };
        await waitFor(
            () =>
                origins[0].state.probes >= 2 &&
                origins[1].state.probes >= 2 &&
                origins[2].state.failedProbes >= 2 &&
                origins[5].state.probes >= 2,
            'completed healthy/failed observations through real VLESS outbounds',
        );
        const names = [];
        for (let n = 0; n < 8; n++) names.push(await request(clientPort));
        assert.deepEqual([...new Set(names)].sort(), ['alpha', 'beta']);
        assert.equal(names.filter((name) => name === 'alpha').length, 4);
        assert.equal(names.filter((name) => name === 'beta').length, 4);
        for (let n = 1; n < names.length; n++) assert.notEqual(names[n], names[n - 1]);
        assert.equal(
            origins[2].state.chosen,
            0,
            'an observed failed member receives no new request',
        );
        assert.equal(await request(manualPort), 'manual');
        stream = await openStream(clientPort);
        const pinned = stream.state.lines[0].split(':')[0];
        const failed = origins.find((item) => item.state.name === pinned);
        const remaining = origins.find(
            (item) => ['alpha', 'beta'].includes(item.state.name) && item !== failed,
        );
        assert(failed && remaining);
        const failedBefore = failed.state.failedProbes;
        failed.state.fail = true;
        await waitFor(
            () => failed.state.failedProbes >= failedBefore + 2,
            'opened stream member is excluded after failed HTTP checks',
        );
        const excludedRequests = failed.state.chosen;
        for (let n = 0; n < 6; n++) assert.equal(await request(clientPort), remaining.state.name);
        assert.equal(failed.state.chosen, excludedRequests);
        const linesBefore = stream.state.lines.length;
        await waitFor(
            () => stream.state.lines.length >= linesBefore + 4,
            'the original TCP stream keeps receiving data',
        );
        assert.equal(stream.state.closed, false);
        assert.equal(stream.state.error, null);
        assert.equal(stream.response.socket, stream.socket);
        assert(stream.state.lines.every((line, sequence) => line === `${pinned}:${sequence}`));
        for (const trapped of origins.slice(3, 5))
            assert.deepEqual(
                [trapped.state.probes, trapped.state.chosen, trapped.state.streams],
                [0, 0, 0],
            );
        const failures = origins.slice(0, 3).map((item) => item.state.failedProbes);
        for (const item of origins.slice(0, 3)) item.state.fail = true;
        await waitFor(
            () =>
                origins.slice(0, 3).every((item, n) => item.state.failedProbes >= failures[n] + 2),
            'all authorized pool members are observed unavailable',
        );
        const routedBefore = origins.map((item) => item.state.chosen);
        for (let n = 0; n < 3; n++) await assert.rejects(request(clientPort));
        assert.deepEqual(
            origins.map((item) => item.state.chosen),
            routedBefore,
            'all-down traffic reaches blackhole, never a failed member or the default/manual outbound',
        );
        const allDownLines = stream.state.lines.length;
        await waitFor(
            () => stream.state.lines.length >= allDownLines + 4,
            'the already-open stream continues while the pool rejects new connections',
        );
        assert.equal(stream.state.closed, false);
        assert(stream.state.lines.every((line, sequence) => line === `${pinned}:${sequence}`));
        assert.equal(core.exitCode, null);
        t.diagnostic(
            `IPv${family}: real new connections rotate across the authorized live pool; failed members are excluded, an open stream stays pinned, all-down uses blackhole, manual leastLoad settings survive`,
        );
    } catch (error) {
        const denied =
            process.platform === 'win32' &&
            family === 6 &&
            (error.code === 'EACCES' ||
                /(?:\[::1\]|::1).*?(?:EACCES|WSAEACCES|forbidden by its access permissions|permission denied)/i.test(
                    log,
                ));
        if (denied) t.skip('Windows IPv6 loopback EACCES; IPv6 remains mandatory on Linux');
        else {
            error.message += '\n' + log;
            throw error;
        }
    } finally {
        stream?.close();
        if (core?.pid && core.exitCode === null) {
            const exited = once(core, 'exit');
            core.kill();
            await exited;
        }
        for (const reservation of reservations)
            if (reservation.listening) await new Promise((resolve) => reservation.close(resolve));
        for (const item of origins) await item.close();
        assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
        fs.rmSync(directory, { recursive: true, force: true });
    }
}

for (const family of [4, 6])
    test(
        `native Xray IPv${family} autoselect distributes connections and fails closed`,
        { timeout: 60000 },
        (t) => runtime(t, family),
    );

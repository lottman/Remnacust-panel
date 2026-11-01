const test = require('node:test');
require('reflect-metadata');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const https = require('node:https');
const tls = require('node:tls');
const jwt = require('jsonwebtoken');
const load = require('./load-typescript.cjs');
const certRoot = path.join(__dirname, '../src/common/utils/certs');
const certificates = load(path.join(certRoot, 'generate-certs.util.ts'));
const sni = load(path.join(certRoot, 'generate-servername.util.ts'));
const versions = load(path.join(__dirname, '../src/common/utils/node-version.ts'));
const errors = {
    INTERNAL_SERVER_ERROR: { code: 'INTERNAL', message: 'internal' },
    NODE_ERROR_WITH_MSG: { withMessage: (message) => ({ code: 'NODE_ERROR', message }) },
    NODE_ERROR_500_WITH_MSG: { withMessage: (message) => ({ code: 'NODE_500', message }) },
};
const { AxiosService } = load(path.join(__dirname, '../src/common/axios/axios.service.ts'), {
    '@common/config/app-config/typed-config.service': {},
    '@common/raw-cache': {},
    '@common/utils/bytes': { prettyBytesUtil: String },
    '@common/utils/certs': sni,
    '@common/utils/get-elapsed-time': { getTime: () => 0, formatExecutionTime: () => '' },
    '@common/utils/node-version': versions,
    '@modules/keygen/commands/get-node-jwt': { GetNodeJwtCommand: class {} },
    '@contract/constants': { ERRORS: errors },
    '../types': {
        ok: (response) => ({ isOk: true, response }),
        fail: (error) => ({ isOk: false, ...error }),
    },
});

test('real panel HTTPS transport and node RSA guard enforce mTLS, SNI, JWT and bounded failures', async (t) => {
    const nodeRoot =
        process.env.REMNACUST_NODE_SOURCE ||
        path.resolve(__dirname, '../../../../Remnacust-node/node');
    const strategyPath = path.join(
        nodeRoot,
        'src/common/guards/jwt-guards/strategies/validate-token.ts',
    );
    if (!fs.existsSync(strategyPath))
        return t.skip('Node source is required; set REMNACUST_NODE_SOURCE');
    const { JwtStrategy } = load(strategyPath, {
        '@common/config/app-config/typed-config.service': {},
    });
    const master = await certificates.generateMasterCerts();
    const serverCert = await certificates.generateNodeCert(master.caCertPem, master.caKeyPem);
    const keys = await certificates.generateJwtKeypair();
    const token = jwt.sign({ fixture: 'node-transport' }, keys.privateKey, {
        algorithm: 'RS256',
        expiresIn: '5m',
    });
    const expectedSni = sni.deriveSni(master.caCertPem, keys.publicKey);
    const context = tls.createSecureContext({
        key: serverCert.nodeKeyPem,
        cert: serverCert.nodeCertPem,
        ca: master.caCertPem,
    });
    let handled = 0,
        redirected = 0;
    let continuityMode = 'valid';
    const continuityNode = {
        uuid: '11111111-1111-4111-8111-111111111111',
        phase: 'ACTIVE',
        userQuota: true,
        instance: '22222222-2222-4222-8222-222222222222',
        core: '33333333-3333-4333-8333-333333333333',
        desiredRevision: '12',
        appliedRevision: '12',
        desiredSource: 'same',
        appliedSource: 'same',
        recovering: false,
        transitioning: false,
    };
    const continuityStatus = {
        version: 'xera-host-policy-v2',
        supported: true,
        applied: true,
        offlineReserves: 'remnacust-quota-reserves-v1',
        userQuotaRequired: true,
        quotaInstanceId: continuityNode.instance,
        coreProcessId: continuityNode.core,
        policyRevision: '12',
        quotaRecoveryFencesSupported: true,
        quotaRecovery: { version: 'remnacust-quota-recovery-fence-v1', record: null },
    };
    const trap = https.createServer(
        { key: serverCert.nodeKeyPem, cert: serverCert.nodeCertPem },
        (_req, res) => {
            redirected++;
            res.end();
        },
    );
    trap.listen(0, '127.0.0.1');
    await new Promise((resolve) => trap.once('listening', resolve));
    const server = https.createServer(
        {
            key: serverCert.nodeKeyPem,
            cert: serverCert.nodeCertPem,
            ca: master.caCertPem,
            requestCert: true,
            rejectUnauthorized: true,
            minVersion: 'TLSv1.3',
            SNICallback: (name, done) =>
                done(name === expectedSni ? null : new Error('unknown sni'), context),
        },
        (req, res) => {
            handled++;
            const strategy = new JwtStrategy({ getOrThrow: () => keys.publicKey });
            strategy.success = () => {
                if (req.url === '/node/xray/host-policy') {
                    if (continuityMode === 'redirect') {
                        res.writeHead(302, {
                            Location: `https://127.0.0.1:${trap.address().port}/trap`,
                        });
                        res.end();
                    } else {
                        res.setHeader('Content-Type', 'application/json');
                        res.end(
                            continuityMode === 'large'
                                ? 'x'.repeat(4 * 1024 * 1024 + 1)
                                : JSON.stringify({ response: continuityStatus }),
                        );
                    }
                    return;
                }
                if (req.url === '/hang') return;
                if (req.url === '/redirect') {
                    res.writeHead(302, {
                        Location: `https://127.0.0.1:${trap.address().port}/trap`,
                    });
                    res.end();
                    return;
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(
                    req.url === '/invalid'
                        ? '{}'
                        : JSON.stringify({ response: { capabilityVersion: 1, state: 'running' } }),
                );
            };
            strategy.fail = () => {
                res.writeHead(401);
                res.end();
            };
            strategy.error = () => {
                res.writeHead(500);
                res.end();
            };
            strategy.authenticate(req, {});
        },
    );
    server.on('tlsClientError', () => {});
    server.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const opts = { address: '127.0.0.1', port: server.address().port, proxyUrl: null };
    const credentials = {
        jwtToken: token,
        jwtPublicKey: keys.publicKey,
        caCert: master.caCertPem,
        clientCert: master.clientCertPem,
        clientKey: master.clientKeyPem,
    };
    const service = new AxiosService(
        { execute: async () => ({ isOk: true, response: credentials }) },
        {},
        { getOrThrow: () => true },
    );
    const agents = [];
    const raw = (options = {}, authorization = token) =>
        new Promise((resolve, reject) => {
            const agent = new https.Agent({
                ca: master.caCertPem,
                cert: master.clientCertPem,
                key: master.clientKeyPem,
                servername: expectedSni,
                checkServerIdentity: () => undefined,
                minVersion: 'TLSv1.3',
                ...options,
            });
            agents.push(agent);
            const request = https.get(
                {
                    hostname: '127.0.0.1',
                    port: opts.port,
                    agent,
                    headers:
                        authorization === null ? {} : { Authorization: 'Bearer ' + authorization },
                },
                (res) => {
                    res.resume();
                    res.once('end', () => resolve(res.statusCode));
                },
            );
            request.once('error', reject);
            request.setTimeout(1500, () => request.destroy(new Error('fixture timeout')));
        });
    try {
        const { checkInstalledNodeContinuity } = load(
            path.join(__dirname, '../src/bin/cli/node-continuity.ts'),
            {
                '@common/utils/certs': sni,
                '@common/axios/mtls-agent': load(
                    path.join(__dirname, '../src/common/axios/mtls-agent.ts'),
                ),
                '@common/host-policy/node-continuity': load(
                    path.join(__dirname, '../src/common/host-policy/node-continuity.ts'),
                ),
            },
        );
        const prisma = {
            keygen: {
                findFirst: async () => ({
                    privKey: keys.privateKey,
                    pubKey: keys.publicKey,
                    caCert: master.caCertPem,
                    clientCert: master.clientCertPem,
                    clientKey: master.clientKeyPem,
                }),
            },
            $transaction: async (callback) =>
                callback({
                    $executeRaw: async () => {},
                    $queryRawUnsafe: async () => [{ ...continuityNode, ...opts }],
                }),
        };
        assert.equal(
            (await checkInstalledNodeContinuity(prisma)).ready,
            true,
            'the actual CLI probe authenticates with the node RSA/mTLS guard',
        );
        for (const mode of ['redirect', 'large']) {
            continuityMode = mode;
            assert.equal((await checkInstalledNodeContinuity(prisma)).ready, false);
            assert.equal(
                (await service.hostPolicy(opts, undefined, undefined, 4 * 1024 * 1024)).isOk,
                false,
            );
        }
        assert.equal(redirected, 0, 'neither continuity transport may redirect credentials');
        continuityMode = 'valid';
        assert.deepEqual(await service.managedCore(opts), {
            isOk: true,
            response: { capabilityVersion: 1, state: 'running' },
        });
        const before = handled;
        await assert.rejects(raw({ cert: undefined, key: undefined }));
        await assert.rejects(raw({ servername: 'wrong.example' }));
        await assert.rejects(raw({ ca: (await certificates.generateMasterCerts()).caCertPem }));
        assert.equal(handled, before, 'failed TLS must not enter an HTTP handler');
        for (const value of [
            null,
            'forged',
            jwt.sign({}, keys.privateKey, { algorithm: 'RS256', expiresIn: -1 }),
            jwt.sign({}, 'fixture-only-secret', { algorithm: 'HS256' }),
        ]) {
            assert.equal(await raw({}, value), 401);
        }
        const request = (route, extra = {}) =>
            service.request({
                label: 'TRANSPORT TEST',
                opts,
                path: route,
                method: 'get',
                timeout: 1500,
                logAxiosError: false,
                ...extra,
            });
        assert.equal((await request('/redirect')).isOk, false);
        assert.equal(redirected, 0, 'authenticated requests must never follow node redirects');
        assert.equal((await request('/invalid')).isOk, false);
        assert.equal((await request('/large', { maxResponseBytes: 8 })).isOk, false);
        assert.equal((await request('/hang', { timeout: 100 })).isOk, false);
        assert.equal(
            (await service.managedCore(opts)).isOk,
            true,
            'transport recovers after a timeout',
        );
    } finally {
        for (const agent of agents) agent.destroy();
        service.axiosInstance.defaults.httpsAgent?.destroy();
        server.closeAllConnections();
        trap.closeAllConnections();
        await Promise.all([
            new Promise((resolve) => server.close(resolve)),
            new Promise((resolve) => trap.close(resolve)),
        ]);
    }
});

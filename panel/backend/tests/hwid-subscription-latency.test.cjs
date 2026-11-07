const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const http = require('node:http');
const load = require('./load-typescript.cjs');

function source(relative, overrides = {}) {
    const file = path.join(__dirname, '../src', relative);
    const mocks = Object.fromEntries(
        [...fs.readFileSync(file, 'utf8').matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => [
            match[1],
            {},
        ]),
    );
    return load(file, {
        ...mocks,
        '@nestjs/common': {
            Injectable: () => (value) => value,
            Logger: class {
                error() {}
                warn() {}
            },
        },
        ...overrides,
    });
}

class UserQuery {}
class DeviceQuery {}
class HostsQuery {}
class Response {
    constructor(value) {
        Object.assign(this, value);
    }
}
const credentials = { username: 'fixture-personal', vlessUuid: 'fixture-personal-key' };
const { DeviceAccessService } = source('modules/hwid-user-devices/device-access.service.ts', {
    '@common/utils/device-identity': {
        deviceCredentials: () => credentials,
        deviceLinkToken: () => 'fixture-link',
    },
    './entities/hwid-user-device.entity': {
        HwidUserDeviceEntity: class {
            constructor(data) {
                Object.assign(this, data);
            }
        },
    },
    '@libs/contracts/constants': { USERS_STATUS: { ACTIVE: 'ACTIVE' } },
});
const { SubscriptionService } = source('modules/subscription/subscription.service.ts', {
    '@common/types': { ok: (response) => ({ isOk: true, response }) },
    '@modules/users/queries/get-user-by-unique-field': { GetUserByUniqueFieldQuery: UserQuery },
    '@modules/hwid-user-devices/queries/check-hwid-exists/check-hwid-exists.query': {
        CheckHwidExistsQuery: DeviceQuery,
    },
    '../hosts/queries/get-hosts-for-user': { GetHostsForUserQuery: HostsQuery },
    '@libs/contracts/constants': { USERS_STATUS: { ACTIVE: 'ACTIVE' } },
    '@modules/hosts/utils/host-traffic-limit': load(
        path.join(__dirname, '../src/modules/hosts/utils/host-traffic-limit.ts'),
    ),
    '../../common/utils/geofile-request-context': {
        currentGeofileOrigin: () => 'https://cdn.example.test',
    },
    './models': { SubscriptionWithConfigResponse: Response },
});

test('Happ and INCY HWID subscription requests respond without node I/O, including overlapping refreshes', async () => {
    const user = {
        id: 1n,
        shortUuid: 'fixture',
        status: 'ACTIVE',
        expireAt: new Date(Date.now() + 86400000),
        vlessUuid: 'fixture-parent',
        hwidDeviceLimit: 2,
    };
    const settings = { hwidSettings: { enabled: true, fallbackDeviceLimit: 2 }, customRemarks: {} };
    let nodeCalls = 0,
        kicks = 0,
        checks = 0;
    const stalled = () => {
        nodeCalls++;
        return new Promise(() => {});
    };
    const devices = {
        registrationAllowed: async () => true,
        checkHwidExists: async () => {
            checks++;
            return { exists: true, blocked: false };
        },
        createWithAdvisoryLock: async () => ({ status: 'EXISTS', hwidDevice: { blocked: false } }),
    };
    const access = new DeviceAccessService(
        { getOrThrow: () => 'fixture-secret' },
        devices,
        { findAllNodes: stalled, findConnectedNodes: stalled },
        { addUser: stalled, deleteUser: stalled },
        { synchronizeUser: stalled },
        {},
    );
    Object.defineProperty(access, 'enabled', { get: () => true });
    access.kickReconciliation = () => { kicks++; };
    const service = Object.create(SubscriptionService.prototype);
    Object.assign(service, {
        deviceAccess: access,
        logger: {
            error: (error) => {
                throw error;
            },
        },
        subPublicDomain: 'main.example.test',
        queryBus: {
            execute: async (query) => ({
                isOk: true,
                response:
                    query instanceof UserQuery
                        ? user
                        : query instanceof DeviceQuery
                          ? { exists: true, blocked: false }
                          : [],
            }),
        },
        applyMaybeExternalSquadOverrides: async () => ({ subscriptionSettings: settings }),
        usersQueuesService: { checkAndUpsertHwidDevice: async () => {} },
        getUserProfileHeadersInfo: () => ({}),
        updateAndReportSubscriptionRequest: async () => {},
        renderSubscription: async ({ user: renderUser }) => ({
            subscription: JSON.stringify({ credential: renderUser.vlessUuid }),
            contentType: 'application/json',
        }),
    });
    const server = http.createServer(async (req, res) => {
        try {
            const result = await service.getSubscriptionByShortUuid(
                {
                    matchedResponseType: 'XRAY_JSON',
                    userAgent: req.headers['user-agent'],
                    hwidHeaders: { hwid: 'fixture-device' },
                    subscriptionSettings: settings,
                },
                'fixture',
            );
            res.writeHead(200, { 'content-type': result.contentType });
            res.end(result.body);
        } catch (error) {
            res.writeHead(500);
            res.end(String(error));
        }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
        const endpoint = `http://127.0.0.1:${server.address().port}/fixture`;
        const started = performance.now();
        const results = await Promise.all(
            Array.from({ length: 100 }, async (_, index) => {
                const response = await fetch(endpoint, {
                    headers: { 'user-agent': index % 2 ? 'Happ/6.3.0/iOS' : 'INCY/2.6.2/iOS' },
                    signal: AbortSignal.timeout(2000),
                });
                assert.equal(
                    response.status,
                    200,
                    response.status === 200 ? undefined : await response.text(),
                );
                return response.json();
            }),
        );
        assert.ok(results.every((result) => result.credential === credentials.vlessUuid));
        assert.equal(nodeCalls, 0);
        assert.equal(kicks, 0);
        assert.ok(checks >= 100);
        console.log(
            `100 local HWID subscription responses: ${Math.round(performance.now() - started)}ms; node calls: ${nodeCalls}`,
        );
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});

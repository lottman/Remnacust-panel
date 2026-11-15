const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '../src');
const filename = path.join(root, 'modules/hosts/hosts.service.ts');
const contracts = require('../libs/contract/build/backend');
const mocks = {};
for (const match of fs.readFileSync(filename, 'utf8').matchAll(/from '([^']+)'/g)) {
    if (!['@nestjs/common', 'node:crypto'].includes(match[1])) mocks[match[1]] = {};
}
mocks['@nestjs-cls/transactional'] = { Transactional: () => () => {} };
mocks['@common/types'] = {
    ok: (response) => ({ isOk: true, response }),
    fail: (error) => ({ isOk: false, ...error }),
};
mocks['@libs/contracts/constants'] = contracts;
mocks['@common/utils/clone-string.util'] = load(
    path.join(root, 'common/utils/clone-string.util.ts'),
);
mocks['./entities/hosts.entity'] = load(path.join(root, 'modules/hosts/entities/hosts.entity.ts'), {
    '@contract/constants': contracts,
});
mocks['./utils/validate-host-policy'] = load(
    path.join(root, 'modules/hosts/utils/validate-host-policy.ts'),
);
mocks['@modules/config-profiles/queries/get-config-profile-by-uuid'] = load(
    path.join(
        root,
        'modules/config-profiles/queries/get-config-profile-by-uuid/get-config-profile-by-uuid.query.ts',
    ),
);
const { HostsService } = load(filename, mocks);

function fixture() {
    const original = {
        uuid: 'host',
        configProfileUuid: 'profile',
        configProfileInboundUuid: 'inbound',
        remark: 'Original',
        address: 'host.example.test',
        port: 443,
        viewPosition: 2,
        isDisabled: false,
        nodes: [{ nodeUuid: 'offline-node' }],
        internalSquads: [{ squadUuid: 'squad' }],
        tags: [],
        userTrafficLimitBytes: null,
        serverSpeedLimitMbps: null,
        totalSpeedLimitMbps: null,
        alwaysAvailable: false,
        onlyWhenInactive: false,
    };
    const profile = {
        uuid: 'profile',
        name: '  ',
        inbounds: [{ uuid: 'inbound', profileUuid: 'profile', tag: 'vless' }],
    };
    const writes = [];
    const rows = [original];
    let profileAvailable = true;
    let profileError;
    const repository = {
        findByUUID: async (uuid) => rows.find((row) => row.uuid === uuid),
        findAll: async () => rows,
        lockPolicies: async () => writes.push('lock'),
        shiftViewPositionsAfter: async (position) => writes.push(['shift', position]),
        create: async (row) => {
            row.uuid = 'cloned';
            rows.push(row);
            writes.push('create');
            return row;
        },
        addNodesToHost: async (uuid, nodes) => writes.push(['nodes', uuid, nodes]),
        addInternalSquadsToHost: async (uuid, squads) => writes.push(['squads', uuid, squads]),
        syncViewPositionSequence: async () => writes.push('sequence'),
        managedPolicyHostIds: async () => new Set(),
        policyBindings: async () => [],
    };
    const service = new HostsService(
        repository,
        { list: async () => [] },
        {
            execute: async (query) => {
                assert.equal(query.uuid, original.configProfileUuid);
                if (profileError) throw profileError;
                return profileAvailable ? { isOk: true, response: profile } : { isOk: false };
            },
        },
        {},
        {},
        {},
        {},
        {},
    );
    service.logger = { error() {} };
    return {
        service,
        original,
        profile,
        writes,
        rows,
        missingProfile: () => {
            profileAvailable = false;
        },
        failProfile: () => {
            profileError = Error('synthetic dependency failure');
        },
    };
}

for (const kind of [
    'null profile',
    'missing profile',
    'null inbound',
    'removed inbound',
    'other profile inbound',
]) {
    test('clone rejects ' + kind + ' without shifting or writing hosts', async () => {
        const f = fixture();
        if (kind === 'null profile') f.original.configProfileUuid = null;
        if (kind === 'missing profile') f.missingProfile();
        if (kind === 'null inbound') f.original.configProfileInboundUuid = null;
        if (kind === 'removed inbound') f.profile.inbounds = [];
        if (kind === 'other profile inbound') f.profile.inbounds[0].profileUuid = 'other-profile';
        const before = structuredClone(f.original);
        const result = await f.service.cloneHost('host');
        assert.equal(result.isOk, false);
        assert.equal(
            result.code,
            (kind.includes('profile') && !kind.includes('inbound')
                ? contracts.ERRORS.CONFIG_PROFILE_NOT_FOUND
                : contracts.ERRORS.CONFIG_PROFILE_INBOUND_NOT_FOUND_IN_SPECIFIED_PROFILE
            ).code,
        );
        assert.deepEqual(f.writes, []);
        assert.deepEqual(f.rows, [before]);
    });
}

test('valid binding clones a disabled host and preserves assignments independent of node availability or label', async () => {
    const f = fixture();
    const before = structuredClone(f.original);
    const result = await f.service.cloneHost('host');
    assert.equal(result.isOk, true);
    assert.equal(result.response.isDisabled, true);
    assert.equal(result.response.configProfileUuid, 'profile');
    assert.equal(result.response.configProfileInboundUuid, 'inbound');
    assert.equal(result.response.viewPosition, 3);
    assert.deepEqual(result.response.nodes, before.nodes);
    assert.deepEqual(result.response.internalSquads, before.internalSquads);
    assert.deepEqual(f.original, before);
    assert.equal(f.writes.filter((value) => value === 'create').length, 1);
});

test('profile lookup failure and unknown host never start clone writes', async () => {
    const f = fixture();
    assert.equal((await f.service.cloneHost('missing')).code, contracts.ERRORS.HOST_NOT_FOUND.code);
    f.failProfile();
    assert.equal((await f.service.cloneHost('host')).code, contracts.ERRORS.CLONE_HOST_ERROR.code);
    assert.deepEqual(f.writes, []);
});

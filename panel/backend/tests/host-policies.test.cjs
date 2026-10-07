const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { validateHostPolicies } = load(
    path.join(__dirname, '../src/modules/hosts/utils/validate-host-policy.ts'),
);
const host = (uuid, tags, nodes = [uuid]) => ({
    uuid,
    tags,
    nodes: nodes.map((nodeUuid) => ({ nodeUuid })),
    configProfileInboundUuid: uuid,
    alwaysAvailable: false,
    onlyWhenInactive: false,
    userTrafficLimitBytes: null,
    serverSpeedLimitMbps: null,
});

test('multiple tag groups, individual and whole-host quotas coexist on a shared inbound', () => {
    const a = {
        ...host('a', ['alpha', 'beta'], ['n']),
        totalSpeedLimitMbps: 10,
    };
    const b = { ...host('b', [], ['n']), configProfileInboundUuid: 'a' };
    assert.doesNotThrow(() =>
        validateHostPolicies(
            [a, b],
            [{ tag: 'alpha' }, { tag: 'beta' }],
            [{ configProfileInboundUuid: 'a', nodeUuid: 'n' }],
        ),
    );
});
test('default binding uses all inbound nodes, explicit selection must be a real binding', () => {
    const a = { ...host('a', [], []), serverSpeedLimitMbps: 2 };
    assert.doesNotThrow(() =>
        validateHostPolicies([a], [], [{ configProfileInboundUuid: 'a', nodeUuid: 'n' }]),
    );
    a.nodes = [{ nodeUuid: 'wrong' }];
    assert.throws(() =>
        validateHostPolicies([a], [], [{ configProfileInboundUuid: 'a', nodeUuid: 'n' }]),
    );
    a.configProfileInboundUuid = null;
    assert.throws(() => validateHostPolicies([a], []));
});
test('active and inactive-only hosts can share an inbound, but inactive-only requires exception availability', () => {
    const a = { ...host('a', []), alwaysAvailable: true, onlyWhenInactive: true };
    assert.doesNotThrow(() =>
        validateHostPolicies([a, { ...host('b', []), configProfileInboundUuid: 'a' }], []),
    );
    a.alwaysAvailable = false;
    assert.throws(() => validateHostPolicies([a], []));
});

test('an individually managed host remains protected after removing its static limits',()=>{
    const managed={...host('a',[],[]),managed:true,configProfileInboundUuid:null};
    assert.throws(()=>validateHostPolicies([managed],[]));
});

test('a global token scope cannot bypass a panel-only role boundary', () => {
    const roles = { ADMIN: 'ADMIN', API: 'API' };
    const { RolesGuard } = load(path.join(__dirname, '../src/common/guards/roles/roles.guard.ts'), {
        '@common/decorators/admin-only-endpoint': { PANEL_ONLY_ENDPOINT: 'panel' },
        '@common/exception/http-exeception-with-error-code.type': {
            HttpExceptionWithErrorCodeType: Error,
        },
        '@libs/contracts/constants': {
            ROLE: roles,
            ERRORS: { FORBIDDEN_ROLE_ERROR: { message: 'forbidden' } },
        },
    });
    const context = (user) => ({
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
    });
    let panelOnly = true;
    const guard = new RolesGuard({
        getAllAndOverride: (key) => (key === 'panel' ? panelOnly : [roles.ADMIN, roles.API]),
    });
    assert.equal(guard.canActivate(context({ role: 'ADMIN' })), true);
    for (const scopes of [[], ['*'], ['nodes:*'], ['nodes:read'], ['backups:list']]) {
        assert.throws(() => guard.canActivate(context({ role: 'API', scopes })), /forbidden/);
    }
    panelOnly = false;
    assert.equal(guard.canActivate(context({ role: 'API', scopes: ['*'] })), true);
    assert.throws(
        () => guard.canActivate(context({ role: 'NOT_ADMIN', scopes: ['*'] })),
        /forbidden/,
    );
});

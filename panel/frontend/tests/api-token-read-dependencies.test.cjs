const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('../../backend/tests/load-typescript.cjs');
const fixture = require('../../backend/tests/api-permissions-fixture.cjs');
const { SCOPE_READ_DEPENDENCIES, getMissingReadRequirements } = load(path.join(__dirname, '../src/widgets/remnawave-settings/api-tokens-card/modals/scope-read-dependencies.ts'));
const { getUserManagementKeys, SUBSCRIPTION_PAGE_SCOPES } = load(path.join(__dirname, '../src/widgets/remnawave-settings/api-tokens-card/modals/api-token-presets.ts'));

test('every enforced read dependency references a current write endpoint and read endpoint', () => {
    assert.equal(SCOPE_READ_DEPENDENCIES.length, 10);
    for (const { scope, requiredScope } of SCOPE_READ_DEPENDENCIES) {
        assert.equal(fixture.catalog.getCatalog().find(entry => entry.key === scope)?.kind, 'write', scope);
        assert.equal(fixture.catalog.getCatalog().find(entry => entry.key === requiredScope)?.kind, 'read', requiredScope);
        assert.deepEqual(getMissingReadRequirements([scope]), [{ scope, requiredScope }]);
        assert.deepEqual(getMissingReadRequirements([scope, 'unrelated:read']), [{ scope, requiredScope }]);
        assert.deepEqual(getMissingReadRequirements([scope, requiredScope]), []);
    }
});

test('read and resource wildcards satisfy dependencies while write wildcards do not', () => {
    for (const { scope, requiredScope } of SCOPE_READ_DEPENDENCIES) {
        const resource = scope.split(':')[0];
        assert.ok(getMissingReadRequirements([`${resource}:write`]).some(entry => entry.scope === scope));
        assert.deepEqual(getMissingReadRequirements([`${resource}:write`, `${resource}:read`]), []);
        assert.deepEqual(getMissingReadRequirements([`${resource}:*`]), []);
        assert.deepEqual(getMissingReadRequirements(['*']), []);
        assert.deepEqual(getMissingReadRequirements([requiredScope]), []);
    }
});

test('presets, creation and no-content actions remain valid without silently adding read grants', () => {
    const resources = fixture.catalog.getGroupedCatalog().resources;
    const selections = [
        [], SUBSCRIPTION_PAGE_SCOPES, getUserManagementKeys(resources),
        fixture.catalog.getCatalog().filter(entry => entry.kind === 'read').map(entry => entry.key),
        fixture.catalog.getCatalog().map(entry => entry.key),
        ['users:create'], ['users:delete'], ['users:bulk-update-users'],
        ['subscription-template:create'], ['external-squads:create'], ['nodes:get'],
    ];
    for (const scopes of selections) {
        const before = [...scopes];
        assert.deepEqual(getMissingReadRequirements(scopes), []);
        assert.deepEqual(scopes, before);
    }
    const writeOnly = ['users:update'];
    getMissingReadRequirements(writeOnly);
    assert.deepEqual(writeOnly, ['users:update']);
});

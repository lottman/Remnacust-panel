const assert=require('node:assert/strict');
const test=require('node:test');
const path=require('node:path');
const load=require('../../backend/tests/load-typescript.cjs');
const fixture=require('../../backend/tests/api-permissions-fixture.cjs');
const {getUserManagementKeys,SUBSCRIPTION_PAGE_SCOPES,getDomainLinkKeys,domainLinkScopeLabel}=load(path.join(__dirname,'../src/widgets/remnawave-settings/api-tokens-card/modals/api-token-presets.ts'));

test('user-management preset includes freeze/update and devices but excludes unrelated writes',()=>{
    const resources=fixture.catalog.getGroupedCatalog().resources;
    const keys=getUserManagementKeys(resources);
    assert.ok(keys.includes('users:update'));
    assert.ok(keys.includes('subscriptions:connection-keys'));
    assert.ok(!keys.includes('subscriptions:list'));
    assert.ok(!keys.includes('subscriptions:subpage-config'));
    assert.ok(keys.some(key=>key.startsWith('hwid-user-devices:')));
    assert.ok(!keys.includes('*'));
    assert.deepEqual(fixture.catalog.findInvalidScopes(keys),[]);
    for(const key of keys) assert.ok(key.startsWith('users:')||key.startsWith('hwid-user-devices:')||resources.some(r=>['internal-squads','external-squads','subscriptions','subscription-domains'].includes(r.resource)&&r.endpoints.some(e=>e.key===key&&e.kind==='read')),key);
    assert.ok(keys.includes('subscription-domains:list'));
    assert.ok(keys.includes('subscription-domains:get'));
    assert.ok(!keys.includes('subscription-domains:create'));
    assert.ok(!keys.includes('subscription-domains:update'));
    assert.ok(!keys.includes('subscription-domains:delete'));
    const endpoint=fixture.endpoints.find(e=>e.method==='PATCH'&&e.url==='/api/users');
    assert.ok(endpoint);assert.equal(fixture.authorize(endpoint,fixture.ROLE.API,keys),true);
    assert.equal(fixture.authorize(endpoint,fixture.ROLE.API,['users:read']),false);
    for(const resource of resources.filter(r=>!['users','hwid-user-devices','internal-squads','external-squads','subscriptions','subscription-domains'].includes(r.resource))) {
        assert.ok(resource.endpoints.every(e=>!keys.includes(e.key)),resource.resource);
    }
});

test('subscription link presets grant exactly one route and keep ordinary and CDN access separate',()=>{
    const resources=fixture.catalog.getGroupedCatalog().resources;
    for(const [kind,key] of [['all','users:subscription-links'],['primary','users:subscription-links-primary'],['cdn','users:subscription-links-cdn']]) {
        const keys=getDomainLinkKeys(resources,kind);
        assert.deepEqual(keys,[key]);
        assert.deepEqual(fixture.catalog.findInvalidScopes(keys),[]);
        assert.equal(domainLinkScopeLabel(key),'user-domain-links.scope-'+kind);
        const suffix=kind==='all'?'':kind==='primary'?'/primary':'/cdn';
        for(const endpoint of fixture.endpoints.filter(e=>e.url.includes('/subscription-links'))) {
            assert.equal(fixture.authorize(endpoint,fixture.ROLE.API,keys),endpoint.url.endsWith('/subscription-links'+suffix),endpoint.url);
        }
    }
    assert.equal(domainLinkScopeLabel('users:update'),undefined);
});

test('subscription page preset matches the installer and never exposes user management',()=>{
    assert.deepEqual(fixture.catalog.findInvalidScopes(SUBSCRIPTION_PAGE_SCOPES),[]);
    assert.ok(!SUBSCRIPTION_PAGE_SCOPES.includes('subscription:get'));
    assert.equal(SUBSCRIPTION_PAGE_SCOPES.length,4);
    assert.ok(!SUBSCRIPTION_PAGE_SCOPES.some(key=>key.startsWith('users:')||key.includes('*')));
});

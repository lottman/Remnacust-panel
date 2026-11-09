const assert=require('node:assert/strict');
const test=require('node:test');
const path=require('node:path');
const load=require('../../backend/tests/load-typescript.cjs');
const fixture=require('../../backend/tests/api-permissions-fixture.cjs');
const {getUserManagementKeys,USER_MANAGEMENT_SCOPES,SUBSCRIPTION_PAGE_SCOPES,getDomainLinkKeys,domainLinkScopeLabel}=load(path.join(__dirname,'../src/widgets/remnawave-settings/api-tokens-card/modals/api-token-presets.ts'));

test('user-management preset grants exactly the reviewed users endpoints and their required reads',()=>{
    const resources=fixture.catalog.getGroupedCatalog().resources;
    const keys=getUserManagementKeys(resources);
    assert.ok(keys.includes('users:update'));
    assert.equal(keys.length,30);
    assert.equal(new Set(keys).size,30);
    assert.deepEqual(keys,[...USER_MANAGEMENT_SCOPES]);
    assert.ok(keys.includes('users:by-id'));
    assert.ok(!keys.includes('*'));
    assert.deepEqual(fixture.catalog.findInvalidScopes(keys),[]);
    for(const key of keys) assert.ok(key.startsWith('users:')&&!key.includes('*'),key);
    const endpoint=fixture.endpoints.find(e=>e.method==='PATCH'&&e.url==='/api/users');
    assert.ok(endpoint);assert.equal(fixture.authorize(endpoint,fixture.ROLE.API,keys),true);
    assert.equal(fixture.authorize(endpoint,fixture.ROLE.API,['users:read']),false);
    for(const entry of fixture.catalog.getCatalog()) {
        const route=fixture.endpoints.find(e=>e.method===entry.method&&e.url===entry.path);
        assert.equal(fixture.authorize(route,fixture.ROLE.API,keys),entry.resource==='users',entry.key);
    }
});

test('user-management preset never adopts future endpoints and respects the available catalog',()=>{
    const resources=fixture.catalog.getGroupedCatalog().resources;
    const future=structuredClone(resources);
    future.find(resource=>resource.resource==='users').endpoints.push({key:'users:future-operation',kind:'write'});
    assert.deepEqual(getUserManagementKeys(future),getUserManagementKeys(resources));
    assert.deepEqual(getUserManagementKeys([{resource:'users',endpoints:[{key:'users:create',kind:'write'}]}]),['users:create']);
    assert.deepEqual(getUserManagementKeys([]),[]);
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

test('the CDN credential permission has a localized label and is absent from bot/page presets', () => {
    assert.equal(domainLinkScopeLabel('subscription-domains:credentials'), 'subscription-domains.scope-credentials');
    assert.ok(!USER_MANAGEMENT_SCOPES.includes('subscription-domains:credentials'));
    assert.ok(!SUBSCRIPTION_PAGE_SCOPES.includes('subscription-domains:credentials'));
});

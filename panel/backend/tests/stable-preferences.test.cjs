const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const frontend = path.resolve(__dirname, '../../frontend/src');
const quick = load(path.join(frontend, 'shared/ui/quick-launcher/quick-links.types.ts'));
const sizing = load(path.join(frontend, 'entities/dashboard/users/users-table-store/column-sizing.ts'));
function storage() {
    const data = new Map();
    return {getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value), removeItem: key => data.delete(key)};
}
test('launcher defaults off, migrates experiments off and retains links and subsequent preference', () => {
    const previous = global.localStorage;
    global.localStorage = storage();
    const createStore = () => load(path.join(frontend, 'entities/dashboard/view-preferences-store/use-view-preferences-store.ts'), {
        '@shared/ui/quick-launcher/quick-links.types': quick,
        './interfaces': {HOSTS_VIEW_MODE: {CARDS:'cards'}, NODES_VIEW_MODE: {CARDS:'cards'}},
    }).useViewPreferencesStore;
    try {
        assert.equal(createStore().getState().launcherEnabled, false);
        localStorage.setItem('viewPreferencesStore', JSON.stringify({version:2,state:{experimental:{quickLauncher:true},quickLinks:[{kind:'modal',id:'snippets'}],launcherPosition:{x:10,y:20}}}));
        const store = createStore();
        assert.equal(store.getState().launcherEnabled, false);
        assert.equal(store.getState().quickLinks[0].id, 'snippets');
        assert.deepEqual(store.getState().launcherPosition,{x:10,y:20});
        store.getState().actions.setLauncherEnabled(true);
        assert.equal(createStore().getState().launcherEnabled, true);
        store.getState().actions.setLauncherEnabled(false);
        assert.equal(createStore().getState().launcherEnabled, false);
        assert.equal(JSON.parse(localStorage.getItem('viewPreferencesStore')).state.experimental, undefined);
    } finally {global.localStorage = previous;}
});
test('launcher rejects executable and credentialed external URLs and bounds stored entries', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,test', 'http://example.org', 'https://user:pass@example.org']) {
        assert.equal(quick.isSafeExternalUrl(url),false);
        assert.deepEqual(quick.sanitizeQuickLinks([{kind:'external',url,label:'Test'}]),[]);
    }
    assert.equal(quick.isSafeExternalUrl('https://example.org/path'),true);
    assert.equal(quick.sanitizeQuickLinks(Array.from({length:100},()=>({kind:'modal',id:'snippets'}))).length,12);
    assert.deepEqual(quick.sanitizeQuickLinks([{kind:'modal',id:'unknown'}]),[]);
});
test('users table clamps existing stored widths and subsequent resizing', () => {
    const previous=global.localStorage; global.localStorage=storage();
    try {
        localStorage.setItem('test-users',JSON.stringify({version:13,state:{columnSize:{id:20,status:10000,username:'bad'},columnFilter:[]}}));
        const {createMrtTableStore}=load(path.join(frontend,'shared/lib/mrt-table-store/create-mrt-table-store.ts'));
        const store=createMrtTableStore({name:'test-users',version:13,normalizeColumnSize:sizing.normalizeUserColumnSizing});
        assert.deepEqual(store.getState().columnSize,{id:120,status:440});
        store.getState().actions.setColumnSize({id:9999,status:-1});
        assert.deepEqual(store.getState().columnSize,{id:200,status:180});
        assert.deepEqual(sizing.normalizeUserColumnSizing({id:NaN,status:Infinity}),{});
    } finally {global.localStorage=previous;}
});

const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const { QueryClient, QueryObserver } = require('@tanstack/react-query');
const load = require('../../backend-3.4.4-xera/tests/load-typescript.cjs');
const { nodeOptimizationQuery } = load(path.join(__dirname, '../src/shared/ui/forms/nodes/base-node-form/node-optimization-query.ts'));
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const state = (nodeUuid, level) => ({nodeUuid, level, checkedAt: null, verifiedAt: level ? '2026-09-27T12:00:00Z' : null, verified: !!level});

test('switching nodes clears displayed optimization until its own result arrives', async () => {
    const client = new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
    const observer = new QueryObserver(client, nodeOptimizationQuery(a, async () => state(a,'performance')));
    const unsubscribe = observer.subscribe(() => {});
    try {
        await observer.refetch();
        assert.equal(observer.getCurrentResult().data.level,'performance');
        let finish;
        const next = new Promise(resolve => { finish=resolve; });
        observer.setOptions(nodeOptimizationQuery(b, async url => {assert.ok(url.includes(b));return next;}));
        assert.equal(observer.getCurrentResult().data,undefined);
        finish(state(b,null));
        await observer.refetch();
        assert.equal(observer.getCurrentResult().data.level,null);
        assert.equal(observer.getCurrentResult().data.verifiedAt,null);
        assert.equal(client.getQueryData(['node-optimization',a]).level,'performance');
    } finally {unsubscribe();client.clear();}
});

test('wrong-node and old unscoped responses cannot display a profile or timestamp', async () => {
    const signal = new AbortController().signal;
    for (const response of [state(a,'performance'),{level:'performance',verified:true,checkedAt:null,verifiedAt:'2026-09-27T12:00:00Z'}]) {
        const options=nodeOptimizationQuery(b,async()=>response);
        await assert.rejects(options.queryFn({signal}));
    }
});

test('parallel node reads preserve independent profiles and late results', async () => {
    const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
    try {
        const [first,second]=await Promise.all([
            client.fetchQuery(nodeOptimizationQuery(a,async()=>state(a,'safe'))),
            client.fetchQuery(nodeOptimizationQuery(b,async()=>state(b,'performance')))
        ]);
        assert.equal(first.nodeUuid,a);assert.equal(first.level,'safe');
        assert.equal(second.nodeUuid,b);assert.equal(second.level,'performance');
    } finally {client.clear();}
});

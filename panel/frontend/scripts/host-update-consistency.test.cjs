const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const load = require('../../backend/tests/load-typescript.cjs')
const { QueryClient, QueryObserver } = require('@tanstack/react-query')
const root = path.join(__dirname, '../src')
const { hostPatch } = load(path.join(root, 'shared/_modals/hosts/edit-host-modal/host-patch.ts'), {
    '@shared/utils/misc/parse-json-field': { parseJsonField: value => value === '' ? null : JSON.parse(value) }
})
const { invalidateHosts, affectsHosts } = load(path.join(root, 'shared/api/host-invalidation.ts'))

test('editing a stale host sends only changed fields and cannot revert a bulk visibility or squad update', () => {
    const stale = { uuid:'host', remark:'Old', isHidden:true, port:443, internalSquads:{mode:'EXCLUDE',squads:[]}, xhttpExtraParams:'broken untouched JSON' }
    const patch = hostPatch({...stale, remark:'New'}, field => field === 'remark', 'host')
    assert.deepEqual(patch, {uuid:'host',remark:'New'})
    const current = {...stale,isHidden:false,internalSquads:{mode:'ALLOW_ONLY',squads:['admin']}}
    assert.deepEqual({...current,...patch}, {...current,remark:'New'})
    assert.deepEqual(hostPatch({...stale,xhttpExtraParams:'{}'}, field=>field==='xhttpExtraParams','host'), {uuid:'host',xhttpExtraParams:{}})
    assert.deepEqual(hostPatch({...stale,xhttpExtraParams:''}, field=>field==='xhttpExtraParams','host'), {uuid:'host',xhttpExtraParams:null})
    assert.deepEqual(hostPatch(stale,()=>false,'host'), {uuid:'host'})
})

test('bulk success invalidates cached host details without fetching every inactive host', async () => {
    const client = new QueryClient({defaultOptions:{queries:{retry:false,staleTime:60000}}})
    const detail = ['hosts','getHost',{uuid:'host'}], list = ['hosts','getAllHosts']
    client.setQueryData(detail,{isHidden:true});client.setQueryData(list,[{isHidden:true}])
    let reads=0
    const observer = new QueryObserver(client,{queryKey:list,queryFn:async()=>{reads++;return [{isHidden:false}]}})
    const stop = observer.subscribe(()=>{})
    await invalidateHosts(client)
    assert.equal(reads,1)
    assert.equal(client.getQueryData(list)[0].isHidden,false)
    assert.equal(client.getQueryState(detail).isInvalidated,true)
    assert.equal(await client.fetchQuery({queryKey:detail,queryFn:async()=>({isHidden:false})}).then(x=>x.isHidden),false)
    stop();client.clear()
    for(const endpoint of ['/api/hosts/bulk/update-many','/hosts/id','hosts']) assert.equal(affectsHosts(endpoint),true)
    assert.equal(affectsHosts('/api/users'),false)
})

test('an old host request cannot overwrite the post-mutation cache', async () => {
    const client = new QueryClient({defaultOptions:{queries:{retry:false}}})
    const key=['hosts','getHost',{uuid:'host'}];let finish
    const old=client.fetchQuery({queryKey:key,queryFn:()=>new Promise(r=>finish=r)}).catch(()=>{})
    await invalidateHosts(client)
    client.setQueryData(key,{isHidden:false});finish({isHidden:true});await old
    assert.equal(client.getQueryData(key).isHidden,false)
    client.clear()
})

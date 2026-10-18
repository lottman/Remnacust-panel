const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const {EMPTY_RECORDING,mergeObservations,MAX_OBSERVATIONS} = load(path.join(__dirname,'../src/modules/connections/session-recording-state.ts'));
const observation=(id,ip='1.2.3.4',nodeUuid='node')=>({userId:id,ip,nodeUuid,nodeName:'Name',countryCode:'PL',lastSeen:'2026-10-18T12:00:00Z',firstObservedAt:'first',lastObservedAt:'first',samples:1});
test('observations deduplicate user/node/IP, preserve first time and count repeated samples',()=>{
 const state=EMPTY_RECORDING();mergeObservations(state,[observation(1),observation(2),observation(1,'1.2.3.4','other')]);
 mergeObservations(state,[{...observation(1),lastObservedAt:'next',lastSeen:'later',nodeName:'Renamed'}]);
 assert.equal(state.observations.length,3);assert.equal(state.observations[0].firstObservedAt,'first');assert.equal(state.observations[0].lastObservedAt,'next');assert.equal(state.observations[0].samples,2);assert.equal(state.observations[0].nodeName,'Renamed');
});
test('capacity is explicit and existing observations still update at limit',()=>{
 const state=EMPTY_RECORDING();mergeObservations(state,Array.from({length:MAX_OBSERVATIONS},(_,i)=>observation(i+1)));
 mergeObservations(state,[observation(MAX_OBSERVATIONS+1),observation(1)]);
 assert.equal(state.observations.length,MAX_OBSERVATIONS);assert.equal(state.truncated,true);assert.equal(state.observations[0].samples,2);
});

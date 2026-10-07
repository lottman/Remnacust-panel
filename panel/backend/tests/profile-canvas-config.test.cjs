const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const load=require('./load-typescript.cjs');
const {xrayRouting}=load(path.resolve(__dirname,'../../frontend/src/pages/dashboard/config-profiles/components/profile-canvas-config.ts'));
test('canvas resolves balancer snippets and links the route to its selector',()=>{
 const config={routing:{rules:[{vlessRoute:20,balancerTag:'NL'}],balancers:[{snippet:'balancers'}]},outbounds:[{snippet:'exits'}]};
 const parsed=xrayRouting(config,[{name:'balancers',snippet:[{tag:'NL',selector:['NL-'],fallbackTag:'direct'}]},
  {name:'exits',snippet:[{tag:'NL-1',protocol:'vless'},{tag:'direct',protocol:'freedom'}]}]);
 assert.equal(parsed.rules[0].balancerTag,parsed.balancers[0].tag);
 assert(parsed.balancers[0].selectors.some(s=>parsed.outbounds[0].tag.startsWith(s)));
 assert.equal(parsed.balancers[0].fallbackTag,'direct');
 assert.deepEqual(config.routing.balancers,[{snippet:'balancers'}]);
});
test('root snippets follow backend precedence without replacing explicit routing',()=>{
 const snippets=[{name:'root',snippet:[{routing:{balancers:[{tag:'NL',selector:['NL']}]},outbounds:[{tag:'NL',protocol:'vless'}]}]}];
 assert.equal(xrayRouting({snippets:['root']},snippets).balancers[0].tag,'NL');
 assert.equal(xrayRouting({snippets:['root'],routing:{balancers:[]}},snippets).balancers.length,0);
 assert.equal(xrayRouting({routing:{balancers:[{snippet:'missing'}]}},snippets).balancers.length,0);
 const cycles=[{name:'cycle',snippet:[{snippet:'cycle'}]}];
 assert.equal(xrayRouting({routing:{balancers:[{snippet:'cycle'}]}},cycles).balancers.length,0);
});

test('TW-HUB topology expands all three snippet locations and retains burst probes',()=>{
 const config={inbounds:[{tag:'IN(TW-HUB)',protocol:'vless',port:50020,listen:'127.0.0.1',
  settings:{clients:[],decryption:'none'},streamSettings:{network:'raw',security:'reality',
   sockopt:{acceptProxyProtocol:true},realitySettings:{privateKey:'TEST-ONLY',target:'127.0.0.1:50000'}}}],
  outbounds:[{snippet:'OUTBOUNDS'},{tag:'direct',protocol:'freedom'}],
  routing:{rules:[{snippet:'ROUTING'}],balancers:[{snippet:'BALANCERS'}]},
  burstObservatory:{pingConfig:{timeout:'2s',interval:'15s',destination:'https://gstatic.com/generate_204'},subjectSelector:['p']}};
 const parsed=xrayRouting(config,[
  {name:'OUTBOUNDS',snippet:[{tag:'p-NL',protocol:'vless'},{tag:'p-DE',protocol:'vless'}]},
  {name:'ROUTING',snippet:[{vlessRoute:20,balancerTag:'NL'},{vlessRoute:100,balancerTag:'auto'}]},
  {name:'BALANCERS',snippet:[{tag:'NL',selector:['p-NL'],strategy:{type:'leastPing'}},
   {tag:'auto',selector:['p'],strategy:{type:'leastLoad'},fallbackTag:'direct'}]}]);
 assert.equal(parsed.balancers.length,2);
 assert.equal(parsed.outbounds.length,3);
 assert.equal(parsed.balancers[1].strategy,'leastLoad');
 assert.equal(parsed.rules[1].vlessRoute,'100');
 assert.deepEqual(parsed.unresolvedSnippets,[]);
 assert(parsed.observation.includes('burstObservatory: selector=p'));
 assert(parsed.observation.includes('burstObservatory.interval: 15s'));
 assert(!JSON.stringify(parsed).includes('TEST-ONLY'));
 assert.deepEqual(xrayRouting(config,[]).unresolvedSnippets.sort(),['BALANCERS','OUTBOUNDS','ROUTING']);
});

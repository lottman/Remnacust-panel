const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const load = require('./load-typescript.cjs');
const {randomBytes} = require('node:crypto');
const key=randomBytes(32).toString('hex');
const session = load(path.join(__dirname, '../src/common/utils/admin-session.ts'));
let sessionOptions,terminated;
const {SshTerminalGateway}=load(path.join(__dirname,'../src/modules/node-ssh/ssh/ssh-terminal.gateway.ts'),{
    '@common/utils/startup-app':{isDevelopment:()=>true},
    '@common/utils/core-ssh-tunnel':{coreSshTunnelKey:uuid=>uuid},
    '@common/utils/admin-session': session,
    '@libs/contracts/constants':{ROLE:{ADMIN:'ADMIN',API:'API'},REMNAWAVE_REAL_IP_HEADER:'x-real-ip'},
    '@libs/contracts/models':{SSH_TERMINAL_WS_PATH:'/api/node-ssh/terminal',SSH_TERMINAL_WS_PROTOCOL:'ssh'},
    '@modules/admin/queries/get-admin-by-username':{GetAdminByUsernameQuery:class{constructor(username,role){Object.assign(this,{username,role})}}},
    '@modules/api-tokens/queries/get-token-by-uuid':{GetTokenByUuidQuery:class{constructor(uuid){this.uuid=uuid}}},
    '@modules/nodes/queries/get-node-by-uuid/get-node-by-uuid.query':{GetNodeByUuidQuery:class{}},
    './ssh-session':{SshSession:class{constructor(ws,options){sessionOptions=options}terminate(reason){terminated=reason;sessionOptions.onClosed()}}},
});
function fixture() {
    const admin={uuid:'admin-id',username:'admin',passwordHash:'isolated-test-hash'};
    const claims=session.createAdminSessionClaims(admin,key);
    const active=new Set([session.adminSessionKey(claims.jti)]);
    const redis={exists:async redisKey=>active.has(redisKey)?1:0};
    const gateway=new SshTerminalGateway({getOrThrow:()=>key,get:()=> 'fixture-storage-token'},{},{},{execute:async query=>query.username===admin.username?{isOk:true,response:admin}:{isOk:false}},redis);
    const token=jwt.sign({role:'ADMIN',uuid:admin.uuid,username:admin.username,...claims},key,{expiresIn:'1m'});
    return {admin,claims,active,redis,gateway,token};
}

test('SSH rejects all API tokens including prior tickets and full scope, but keeps a current administrator session',async()=>{
    const {admin,gateway,token,active}=fixture();
    for(const scopes of [[],['*'],['node-ssh:*'],['node-ssh:write'],['node-ssh:create-ticket']]){
        const token=jwt.sign({role:'API',uuid:'token-id',username:'admin',scopes},key,{expiresIn:'1m'});
        assert.equal(await gateway.verifyAdminToken(token),null);
    }
    assert.deepEqual(await gateway.verifyAdminToken(token),{uuid:admin.uuid,username:admin.username});
    assert.equal(await gateway.verifyAdminToken(jwt.sign({role:'ADMIN',uuid:admin.uuid,username:admin.username},key,{expiresIn:'1m'})),null);
    active.clear();assert.equal(await gateway.verifyAdminToken(token),null);
    admin.uuid='changed';assert.equal(await gateway.verifyAdminToken(token),null);
    assert.equal(await gateway.verifyAdminToken(jwt.sign({role:'ADMIN',uuid:'admin-id',username:'admin'},'wrong')),null);
});

for (const change of ['logout', 'password reset', 'Redis unavailable']) {
    test(`${change} terminates an established SSH session using the real session validator`, async () => {
        const {admin,active,redis,gateway,token}=fixture();
        let tick;
        const original=global.setInterval;
        global.setInterval=callback=>{tick=callback;return{unref(){}}};
        terminated=undefined;
        try {
            const identity=await gateway.verifyAdminToken(token);
            assert(identity);
            gateway.startSession({}, {address:'127.0.0.1',ips:[],port:22,uuid:'node'}, identity,token);
            await tick();
            assert.equal(terminated,undefined);
            assert.equal(gateway.sessions.size,1);
            if(change==='logout') active.clear();
            else if(change==='password reset') admin.passwordHash='changed-test-hash';
            else redis.exists=async()=>{throw Error('offline')};
            await tick();
            assert.match(terminated,/revoked|Could not verify/);
            assert.equal(gateway.sessions.size,0);
            if(change!=='Redis unavailable') assert.equal(await gateway.verifyAdminToken(token),null);
        } finally {global.setInterval=original}
    });
}

test('permission revocation terminates an existing SSH session on its periodic check',async()=>{
    const gateway=new SshTerminalGateway({},{},{},{},{});
    let tick;
    const original=global.setInterval;
    global.setInterval=callback=>{tick=callback;return{unref(){}}};
    gateway.verifyAdminToken=async()=>null;
    terminated=undefined;
    try{
        gateway.startSession({}, {address:'127.0.0.1',ips:[],port:22,uuid:'node'}, {uuid:'api',username:'api'},'test-token');
        await tick();
        assert.match(terminated,/revoked/);assert.equal(gateway.sessions.size,0);
    }finally{global.setInterval=original}
});

test('node upgrade revalidates authorization without accessing a private storage token',async()=>{
 const {gateway,token,active}=fixture();
 const original=global.setInterval;global.setInterval=()=>({unref(){}});
 try {
  gateway.startSession({}, {address:'127.0.0.1',ips:[],port:22,uuid:'node'},await gateway.verifyAdminToken(token),token);
  gateway.configService.get=()=>{throw Error('Private storage must not be accessed')};
  assert.equal(await sessionOptions.authorizeNodeUpgrade(),undefined);
  active.clear();await assert.rejects(sessionOptions.authorizeNodeUpgrade(),/expired/);
 }finally{global.setInterval=original}
});

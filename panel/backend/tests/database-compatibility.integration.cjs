const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const backend=path.resolve(__dirname,'..');
assert.ok(process.env.COMPATIBILITY_TEST_DATABASE_URL, 'Set an isolated COMPATIBILITY_TEST_DATABASE_URL');
assert.equal(new URL(process.env.COMPATIBILITY_TEST_DATABASE_URL).pathname, '/remnacust_compatibility_test');
process.env.DATABASE_URL=process.env.COMPATIBILITY_TEST_DATABASE_URL;
process.env.DIRECT_URL=process.env.DATABASE_URL;
process.env.APP_SECRET='compatibility-test-only-original-secret';
const {PrismaClient}=require(path.join(backend,'node_modules/@prisma/client'));
const load=require(path.join(backend,'tests/load-typescript.cjs'));
const crypto=load(path.join(backend,'src/common/utils/xera-crypto.ts'));
const {restoreStoredUserCredentials,restoreUserCredentials}=load(path.join(backend,'src/common/utils/restore-user-credentials.ts'),{'./xera-crypto':crypto});
const prisma=new PrismaClient();
function run(args,extra={},fail=false){const r=spawnSync(process.execPath,args,{cwd:backend,env:{...process.env,...extra},encoding:'utf8'});if(fail)assert.notEqual(r.status,0);else assert.equal(r.status,0,r.stderr+r.stdout);return r;}
(async()=>{
 run(['node_modules/prisma/build/index.js','migrate','deploy']);
 const admin=await prisma.admin.create({data:{username:'compat-admin',passwordHash:'unchanged-test-hash',role:'ADMIN'}});
 const settings=await prisma.remnawaveSettings.create({data:{id:1,brandingSettings:{title:'Saved title'},passwordSettings:{enabled:true}}});
 const user=await prisma.users.create({data:{username:'compat-user',shortUuid:'compat-short',vlessUuid:'11111111-1111-4111-8111-111111111111',trojanPassword:crypto.encryptSecret('original-trojan'),ssPassword:crypto.encryptSecret('original-ss'),expireAt:new Date('2030-01-01')}});
 await prisma.$executeRawUnsafe('ALTER TABLE public.remnawave_settings RENAME TO xera_remnawave_settings');
 await prisma.$executeRawUnsafe('ALTER TABLE public.admin RENAME TO xera_admin');
 run(['dist/database-compatibility.js','--apply'],{APP_SECRET:'wrong-test-only-secret'},true);
 assert.equal((await prisma.$queryRawUnsafe("SELECT to_regclass('public.xera_admin')::text AS name"))[0].name,'xera_admin');
 assert.equal((await prisma.users.findUnique({where:{id:user.id}})).trojanPassword,user.trojanPassword);
 console.log('PASS wrong APP_SECRET rolls back table names and credentials');
 await prisma.$executeRawUnsafe('CREATE TABLE public.admin (test_id integer)');
 run(['dist/database-compatibility.js','--apply'],{},true);
 assert.equal((await prisma.$queryRawUnsafe("SELECT to_regclass('public.xera_remnawave_settings')::text AS name"))[0].name,'xera_remnawave_settings');
 await prisma.$executeRawUnsafe('DROP TABLE public.admin');
 console.log('PASS table conflict preserves both legacy tables');
 run(['dist/database-compatibility.js','--apply']);
 assert.equal((await prisma.admin.findUnique({where:{uuid:admin.uuid}})).passwordHash,admin.passwordHash);
 assert.deepEqual((await prisma.remnawaveSettings.findUnique({where:{id:1}})).brandingSettings,settings.brandingSettings);
 const restored=await prisma.users.findUnique({where:{id:user.id}});
 assert.equal(restored.trojanPassword,'original-trojan');assert.equal(restored.ssPassword,'original-ss');assert.equal(restored.vlessUuid,user.vlessUuid);
 console.log('PASS legacy schema, accounts, settings and client credentials are preserved');
 run(['dist/database-compatibility.js','--apply']);
 assert.equal(await prisma.users.count(),1);
 console.log('PASS repeated repair is idempotent');
 // Reproduce an old installed fork with branding and compatibility migrations pending.
 await prisma.users.update({where:{id:user.id},data:{trojanPassword:user.trojanPassword,ssPassword:user.ssPassword}});
 await prisma.$executeRawUnsafe('ALTER TABLE public.remnawave_settings RENAME TO xera_remnawave_settings');
 await prisma.$executeRawUnsafe('ALTER TABLE public.admin RENAME TO xera_admin');
 await prisma.$executeRawUnsafe("DELETE FROM _prisma_migrations WHERE migration_name IN ('20261001010000_remnacust_branding','20261004120000_restore_upstream_table_names')");
 run(['node_modules/prisma/build/index.js','migrate','deploy']);
 assert.equal(await restoreStoredUserCredentials(prisma),1);
 assert.equal((await prisma.users.findUnique({where:{id:user.id}})).trojanPassword,'original-trojan');
 console.log('PASS ordinary startup repairs the historical fork before serving users');
 // Force a real competing edit between reading the encrypted values and updating them.
 await prisma.users.update({where:{id:user.id},data:{trojanPassword:user.trojanPassword,ssPassword:user.ssPassword}});
 let changed=false;
 await prisma.$transaction(async tx=>restoreUserCredentials({users:{findMany:async query=>{
  const rows=await tx.users.findMany(query);
  if(!changed&&rows.length){changed=true;await prisma.users.update({where:{id:user.id},data:{trojanPassword:'concurrent-new-password'}});}
  return rows;
 }},$executeRaw:statement=>tx.$executeRaw(statement)}));
 const raced=await prisma.users.findUnique({where:{id:user.id}});
 assert.equal(raced.trojanPassword,'concurrent-new-password');assert.equal(raced.ssPassword,'original-ss');
 console.log('PASS concurrent edits win while the other encrypted field is repaired');
 // A broken later page must roll back earlier successful batches.
 const bulk=Array.from({length:251},(_,i)=>({username:'compat-batch-'+i,shortUuid:'compat-batch-'+i,vlessUuid:require('node:crypto').randomUUID(),trojanPassword:i===250?'xera1:broken':crypto.encryptSecret('batch-original'),ssPassword:'plain',expireAt:new Date('2030-01-01')}));
 await prisma.users.createMany({data:bulk});
 await assert.rejects(()=>restoreStoredUserCredentials(prisma),/original APP_SECRET/);
 assert.equal(await prisma.users.count({where:{username:{startsWith:'compat-batch-'},trojanPassword:{startsWith:'xera1:'}}}),251);
 await prisma.users.deleteMany({where:{username:{startsWith:'compat-batch-'}}});
 console.log('PASS a corrupt later batch rolls back the entire credential repair');
 await prisma.$disconnect();
})().catch(async e=>{console.error(e);await prisma.$disconnect();process.exitCode=1;});

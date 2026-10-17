const assert=require('node:assert/strict');const path=require('node:path');const crypto=require('node:crypto');const {execFileSync}=require('node:child_process');const load=require('./load-typescript.cjs');
assert.equal(process.env.USAGE_BACKUP_TEST,'1','Enable only on the disposable audit database container');
const container='remnacust-final-audit-db',source=process.env.USAGE_BACKUP_SOURCE_DATABASE??'remnacust_usage_receipts_test',restored='remnacust_usage_receipts_restore';
assert.ok(['remnacust_usage_receipts_test','remnacust_legacy_usage_test'].includes(source));
const dump='/tmp/remnacust-usage-backup-'+crypto.randomUUID()+'.dump';assert.match(dump,/^\/tmp\/remnacust-usage-backup-[a-f0-9-]{36}\.dump$/);
function docker(...args){return process.platform==='win32'?execFileSync('wsl',['-d','Ubuntu-24.04','-u','root','--','docker',...args],{encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024}):execFileSync('docker',args,{encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});}
const sql=(database,query)=>docker('exec',container,'psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-Atc',query).trim();
const debt=[{u:'901',b:'9007199254740993',n:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}];
const debtDigest=crypto.createHash('sha256').update(JSON.stringify(debt)).digest('hex'),emptyDigest=crypto.createHash('sha256').update('[]').digest('hex');
let created=false;
try {
    const inspected=JSON.parse(docker('inspect',container))[0];assert.equal(inspected.Name,'/'+container);const ports=inspected.HostConfig.PortBindings['5432/tcp'];assert.ok(ports.some(port=>port.HostIp==='127.0.0.1'&&port.HostPort==='55439'));
    assert.equal(sql(source,'SELECT count(*) FROM users'), '2');assert.equal(sql(source,"SELECT count(*) FROM users WHERE username IN ('host-policy-u1','host-policy-u2')"),'2');
    // A historical orphan is deliberately preserved after deletion of its node.
    sql(source,`INSERT INTO xera_node_usage_streams(stream_id,node_uuid,node_id,next_sequence,expected_core,requested_at,consumption_multiplier,committed_digest,pending_effects,last_committed_sequence)
        VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-dddd-4ddd-8ddd-dddddddddddd',902,7,'ff29ee68-a625-4160-9573-cc17de317a5d',clock_timestamp(),1000000000,repeat('b',64),
        '{"owners":[{"id":"901","bytes":"9007199254740993"}],"firstConnected":[],"capturedAt":"1"}'::jsonb,7)`);
    sql(source,`INSERT INTO xera_legacy_usage_streams(stream_id,node_uuid,node_id,requested_at,consumption_multiplier,payload,uncertain_since)
        VALUES('abababab-abab-4bab-8bab-abababababab','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',903,clock_timestamp(),1500000000,
        '{"stats":[{"name":"user>>>901>>>traffic>>>uplink","value":"9007199254740993"}],"capturedAt":"1","coreProcessId":null}'::jsonb,clock_timestamp());
        INSERT INTO xera_legacy_usage_jobs(receipt,digest,payload,applied,pending_users) VALUES(repeat('f',64),'${emptyDigest}','[]'::jsonb,true,'["901"]'::jsonb);
        INSERT INTO xera_legacy_usage_jobs(receipt,digest,payload) VALUES(repeat('c',64),'${debtDigest}','${JSON.stringify(debt)}'::jsonb)`);
    const compare=`SELECT string_agg(md5(row_to_json(s)::text),',' ORDER BY stream_id) FROM xera_node_usage_streams s;
        SELECT string_agg(md5(row_to_json(l)::text),',' ORDER BY stream_id) FROM xera_legacy_usage_streams l;
        SELECT string_agg(md5(row_to_json(j)::text),',' ORDER BY receipt) FROM xera_legacy_usage_jobs j;
        SELECT string_agg(md5(row_to_json(m)::text),',' ORDER BY node_uuid) FROM xera_quota_node_modes m;
        SELECT used_traffic_bytes::text||':'||lifetime_used_traffic_bytes::text FROM user_traffic WHERE id=901;
        SELECT count(*) FROM xera_node_usage_streams WHERE pending_effects IS NOT NULL;`;
    const before=sql(source,compare);
    const {backupDumpArguments}=load(path.join(__dirname,'../src/modules/backups/backup-dump-options.ts'));
    const args=backupDumpArguments(new URL('postgresql://postgres@127.0.0.1:5432/'+source));
    docker('exec',container,'pg_dump',...args,'--file='+dump);
    const toc=docker('exec',container,'pg_restore','--list',dump);assert.match(toc,/TABLE DATA public xera_node_usage_streams/);assert.match(toc,/TABLE DATA public xera_quota_node_modes/);assert.match(toc,/TABLE DATA public xera_legacy_usage_streams/);assert.match(toc,/TABLE DATA public xera_legacy_usage_jobs/);assert.doesNotMatch(toc,/TABLE DATA public xera_node_health_logs/);
    docker('exec',container,'createdb','-U','postgres',restored);created=true;
    docker('exec',container,'pg_restore','-U','postgres','--exit-on-error','--no-owner','--no-privileges','--dbname='+restored,dump);
    assert.equal(sql(restored,compare),before,'restoration must preserve stream watermarks, pending outbox, initial-core fence proof and int64 billing exactly');
    assert.equal(sql(restored,'SELECT count(*) FROM xera_node_health_logs'),'0');
    const replay=execFileSync(process.execPath,[path.join(__dirname,'usage-backup-replay.integration.cjs')],{
        env:{...process.env,USAGE_RESTORE_REPLAY_DATABASE_URL:'postgresql://postgres@127.0.0.1:55439/'+restored},encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024,
    });process.stdout.write(replay);
    console.log('PASS actual compact pg_dump/pg_restore: native/legacy streams, uncertain reads, old job receipts, orphan outbox, cutover proof and int64 counters survive; diagnostic log rows remain excluded');
} finally {
    if(created)docker('exec',container,'dropdb','-U','postgres',restored);
    docker('exec',container,'rm','-f',dump);
}

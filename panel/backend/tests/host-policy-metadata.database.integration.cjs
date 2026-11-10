const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { Client } = require('pg');

const connectionString = process.env.HOST_POLICY_METADATA_TEST_DATABASE_URL;
const source = fs.readFileSync(path.join(__dirname, '../src/common/host-policy/host-policy.service.ts'), 'utf8');
const tree = ts.createSourceFile('host-policy.service.ts', source, ts.ScriptTarget.Latest, true);
const queries = [];
function visit(node) {
    if (ts.isTaggedTemplateExpression(node) && node.typeArguments?.[0]?.getText(tree) === 'PolicyHost') {
        assert(ts.isNoSubstitutionTemplateLiteral(node.template));
        queries.push(node.template.text);
    }
    ts.forEachChild(node, visit);
}
visit(tree);
assert.equal(queries.length, 1);
const query = queries[0];

test('host policy metadata scans issued identities once and remains fresh without an authorization cache', {
    skip: !connectionString,
    timeout: 30000,
}, async () => {
    assert.equal(process.env.HOST_POLICY_METADATA_TEST_DISPOSABLE, '1');
    const client = new Client({ connectionString });
    await client.connect();
    try {
        await client.query('BEGIN');
        await client.query('SET LOCAL search_path=pg_temp,public; SET LOCAL statement_timeout=10000; SET LOCAL max_parallel_workers_per_gather=0');
        await client.query(`CREATE TEMP TABLE hosts (
            uuid uuid PRIMARY KEY, tags text[] DEFAULT '{}', config_profile_inbound_uuid uuid,
            always_available boolean DEFAULT false, only_when_inactive boolean DEFAULT false,
            user_traffic_limit_bytes bigint DEFAULT 0, traffic_multiplier double precision,
            server_speed_limit_mbps int DEFAULT 0, device_speed_limit_mbps int DEFAULT 0,
            total_speed_limit_mbps int DEFAULT 0, use_tag_traffic_limit boolean DEFAULT true,
            use_tag_speed_limit boolean DEFAULT true, use_tag_device_speed_limit boolean DEFAULT true,
            use_tag_total_speed_limit boolean DEFAULT true, traffic_limit_reset_anchor_at timestamptz,
            traffic_limit_reset_value int DEFAULT 0, traffic_limit_reset_unit text DEFAULT 'DAYS', domain_rules jsonb
        ); CREATE TEMP TABLE config_profile_inbounds (uuid uuid,tag text,profile_uuid uuid);
        CREATE TEMP TABLE hosts_to_nodes (host_uuid uuid,node_uuid uuid);
        CREATE TEMP TABLE config_profile_inbounds_to_nodes (config_profile_inbound_uuid uuid,node_uuid uuid);
        CREATE TEMP TABLE xera_host_identities (host_uuid uuid NOT NULL,user_id bigint NOT NULL);
        CREATE TEMP TABLE xera_limit_scopes (kind text,key text);
        CREATE INDEX ON xera_host_identities(host_uuid);
        INSERT INTO hosts(uuid) SELECT md5('host-'||i)::uuid FROM generate_series(1,96) i;
        INSERT INTO xera_host_identities(host_uuid,user_id)
        SELECT md5('host-'||(i%16+1))::uuid,i FROM generate_series(1,60000) i;
        ANALYZE hosts; ANALYZE xera_host_identities;`);
        const expected = new Set((await client.query('SELECT DISTINCT host_uuid FROM xera_host_identities')).rows.map(row => row.host_uuid));
        const assertRows = rows => {
            assert.equal(rows.length, 96);
            assert.equal(new Set(rows.map(row => row.uuid)).size, 96);
            for (const row of rows) {
                assert.equal(row.issued, expected.has(row.uuid));
                assert.equal(row.managed, false);
                assert.deepEqual(row.nodes, []);
                assert.deepEqual(row.boundNodes, []);
                assert.equal(row.alwaysAvailable, false);
            }
        };
        assertRows((await client.query(query)).rows);
        const fresh = (await client.query("INSERT INTO xera_host_identities(host_uuid,user_id) VALUES (md5('host-40')::uuid,60001) RETURNING host_uuid")).rows[0].host_uuid;
        expected.add(fresh);
        assertRows((await client.query(query)).rows);
        await client.query('DELETE FROM xera_host_identities WHERE host_uuid=$1', [fresh]);
        expected.delete(fresh);
        assertRows((await client.query(query)).rows);
        const plan = (await client.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + query)).rows[0]['QUERY PLAN'][0];
        const scans = [];
        function walk(node) {
            if (node['Relation Name'] === 'xera_host_identities') scans.push(node);
            for (const child of node.Plans ?? []) walk(child);
        }
        walk(plan.Plan);
        assert.equal(scans.length, 1);
        assert.equal(scans[0]['Actual Loops'], 1);
        assert(scans[0]['Actual Rows'] <= 60000);
        process.stdout.write(JSON.stringify({ test: 'host-policy-metadata', hosts: 96, identities: 60000, identityScanLoops: 1, executionMs: plan['Execution Time'] }) + '\n');
    } finally {
        await client.query('ROLLBACK').catch(() => {});
        await client.end();
    }
});

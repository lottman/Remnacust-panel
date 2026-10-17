"""Restore only the named disposable coordinator fixture, retaining unknown debt."""
import hashlib
import json
import subprocess
import uuid


def docker(*args, check=True):
    return subprocess.run(['docker', *args], check=check, capture_output=True, text=True, timeout=90)


def query(database, statement, check=True):
    return docker('exec', 'remnacust-final-audit-db', 'psql', '-U', 'postgres', '-d', database,
                  '-v', 'ON_ERROR_STOP=1', '-Atc', statement, check=check)


def main():
    container = json.loads(docker('inspect', 'remnacust-final-audit-db').stdout)[0]
    assert container['Config']['Image'] == 'postgres:18.4'
    assert container['NetworkSettings']['Ports']['5432/tcp'] == [{'HostIp': '127.0.0.1', 'HostPort': '55439'}]
    source = 'remnacust_coordinator_test'
    target = 'remnacust_exposure_restore_test'
    selection = 'SELECT row_to_json(e)::text FROM xera_quota_usage_exposures e ORDER BY node_uuid,core_uuid,instance_uuid,kind,key,user_id'
    before = query(source, selection).stdout
    grants_selection = 'SELECT row_to_json(g)::text FROM xera_quota_reserves g ORDER BY id'
    grants_before = query(source, grants_selection).stdout
    assert 'registered_revision' in grants_before and 'registration_fixture' in grants_before
    watermarks_selection = 'SELECT row_to_json(w)::text FROM xera_quota_journal_watermarks w ORDER BY node_uuid,instance_uuid'
    watermarks_before = query(source, watermarks_selection).stdout
    assert watermarks_before, 'Run the latest watermarked coordinator fixture first'
    assert before and 'exposure_restart' in before, 'Run the dedicated coordinator fixture first'
    snapshot = '/tmp/remnacust-exposure-' + uuid.uuid4().hex + '.dump'
    try:
        docker('exec', 'remnacust-final-audit-db', 'pg_dump', '-U', 'postgres', '--format=custom', '--compress=6',
               '--exclude-table-data=public.xera_node_health_logs', '--file=' + snapshot, source)
        query('postgres', 'DROP DATABASE IF EXISTS ' + target + ' WITH (FORCE)')
        query('postgres', 'CREATE DATABASE ' + target)
        docker('exec', 'remnacust-final-audit-db', 'pg_restore', '-U', 'postgres', '--exit-on-error', '--no-owner', '-d', target, snapshot)
        after = query(target, selection).stdout
        assert hashlib.sha256(after.encode()).digest() == hashlib.sha256(before.encode()).digest()
        assert hashlib.sha256(query(target, grants_selection).stdout.encode()).digest() == hashlib.sha256(grants_before.encode()).digest()
        assert query(target, watermarks_selection).stdout == watermarks_before
        previous_generation = query(target, 'SELECT generation FROM xera_quota_restore_state').stdout.strip()
        assert query(target, 'SELECT xera_quarantine_restored_quotas()').stdout.strip() == 't'
        assert query(target, 'SELECT generation FROM xera_quota_restore_state').stdout.strip() != previous_generation
        blocked = query(target, 'SELECT 1 FROM xera_assert_quota_restore_reconciled()', check=False)
        assert blocked.returncode != 0 and 'QUOTA_RESTORE_REQUIRES_RECONCILIATION' in blocked.stderr
        result = query(target, 'UPDATE xera_quota_reserves SET activation_revision=NULL WHERE activation_revision IS NOT NULL', check=False)
        assert result.returncode != 0 and 'cannot be rewritten' in result.stderr
        result = query(target, "SELECT 1 FROM xera_assert_quota_exposure_covered('TAG','exposure_restart',901)", check=False)
        assert result.returncode != 0 and 'QUOTA_USAGE_REQUIRES_RECOVERY' in result.stderr
        print('PASS actual pg_dump/pg_restore preserves every exposure and still rejects funding over old-process unknown debt')
        print('PASS actual restore preserves every grant and its registration/activation/cancellation provenance with immutable-history guards')
        print('PASS actual restore preserves journal watermarks and starts a new reconciliation barrier before fresh credit')
    finally:
        docker('exec', 'remnacust-final-audit-db', 'rm', '-f', snapshot, check=False)


if __name__ == '__main__':
    main()

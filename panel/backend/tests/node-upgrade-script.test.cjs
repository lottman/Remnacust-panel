const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const load = require('./load-typescript.cjs');
const { nodeUpgradeScript } = load(path.join(__dirname, '../src/modules/node-ssh/ssh/node-upgrade.ts'));

test('remote upgrade verifies a pinned installer and passes the literal directory; corrupted downloads never execute',
    { skip: process.platform === 'win32' || process.getuid?.() !== 0 }, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remnacust-upgrade-fixture-'));
    const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
    const directory = path.join(root, 'node $(touch PWNED); space'); fs.mkdirSync(directory);
    const marker = path.join(root, 'invocation');
    const installer = '#!/bin/bash\nprintf "%s\\n" "$@" > "$QA_MARKER"\nexit "${QA_EXIT:-0}"\n';
    const digest = crypto.createHash('sha256').update(installer).digest('hex');
    fs.writeFileSync(path.join(root, 'installer.sh'), installer);
    fs.writeFileSync(path.join(root, 'SHA256SUMS'), digest + '  installer.sh\n');
    const release = { tag_name: 'v9.9.9', draft: false, prerelease: false, assets: ['installer.sh', 'SHA256SUMS'].map(name => ({ name, state: 'uploaded', browser_download_url: 'https://github.com/lottman/Remnacust-installer/releases/download/v9.9.9/' + name, ...(name === 'installer.sh' ? { digest: 'sha256:' + digest } : {}) })) };
    fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify(release));
    fs.writeFileSync(path.join(bin, 'docker'), '#!/bin/bash\nexit 90\n', { mode: 0o700 });
    fs.writeFileSync(path.join(bin, 'curl'), `#!/usr/bin/python3
import os,pathlib,sys
args=sys.argv[1:]
assert args[args.index('--proto')+1]=='=https'
assert args[args.index('--proto-redir')+1]=='=https'
url=args[args.index('-o')-1]; destination=pathlib.Path(args[args.index('-o')+1])
name='release.json' if url.endswith('/latest') else url.rsplit('/',1)[1]
destination.write_bytes((pathlib.Path(os.environ['QA_ROOT'])/name).read_bytes())
`, { mode: 0o700 });
    const script = nodeUpgradeScript({ t: 'node-upgrade', id: '00000000-0000-4000-8000-000000000001', directory });
    const run = extra => spawnSync('bash', ['-s'], { input: script, encoding: 'utf8', env: { ...process.env, PATH: bin + ':' + process.env.PATH, QA_ROOT: root, QA_MARKER: marker, ...extra }, timeout: 20000 });
    try {
        assert.equal(spawnSync('bash', ['-n'], { input: script }).status, 0);
        const passed = run(); assert.equal(passed.status, 0, passed.stderr);
        assert.deepEqual(fs.readFileSync(marker, 'utf8').trim().split('\n'), ['upgrade-node', '--directory', directory, '--version', '9.9.9', '--yes']);
        assert.equal(fs.existsSync(path.join(root, 'PWNED')), false);
        assert.equal(run({ QA_EXIT: '19' }).status, 19, 'Installer failure propagates');
        fs.unlinkSync(marker);
        fs.writeFileSync(path.join(root, 'SHA256SUMS'), '0'.repeat(64) + '  installer.sh\n');
        assert.notEqual(run().status, 0); assert.equal(fs.existsSync(marker), false);
        fs.writeFileSync(path.join(root, 'SHA256SUMS'), digest + '  installer.sh\n');
        release.assets[0].browser_download_url = 'https://other.example/installer.sh';
        fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify(release));
        assert.notEqual(run().status, 0); assert.equal(fs.existsSync(marker), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

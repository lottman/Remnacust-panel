const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const load = require('./load-typescript.cjs');
const { nodeUpgradeScript } = load(
    path.join(__dirname, '../src/modules/node-ssh/ssh/node-upgrade.ts'),
);

test(
    'SSH install uses a pinned verified installer, private environment and refuses existing installations',
    { skip: process.platform === 'win32' || process.getuid?.() !== 0 },
    () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remnacust-install-proof-'));
        const bin = path.join(root, 'bin');
        fs.mkdirSync(bin);
        const directory = path.join(root, 'new $(touch PWNED) node');
        const secret = 'Z'.repeat(128),
            marker = path.join(root, 'invocation');
        const installer =
            '#!/bin/bash\nprintf "%s\\n" "$@" > "$QA_MARKER"\nprintf "%s" "$REMNACUST_NODE_SECRET" | sha256sum >> "$QA_MARKER"\n';
        const digest = createHash('sha256').update(installer).digest('hex');
        fs.writeFileSync(path.join(root, 'installer.sh'), installer);
        fs.writeFileSync(path.join(root, 'SHA256SUMS'), digest + '  installer.sh\n');
        fs.writeFileSync(
            path.join(root, 'release.json'),
            JSON.stringify({
                tag_name: 'v9.9.9',
                draft: false,
                prerelease: false,
                assets: ['installer.sh', 'SHA256SUMS'].map((name) => ({
                    name,
                    state: 'uploaded',
                    browser_download_url:
                        'https://github.com/lottman/Remnacust-installer/releases/download/v9.9.9/' +
                        name,
                    ...(name === 'installer.sh' ? { digest: 'sha256:' + digest } : {}),
                })),
            }),
        );
        fs.writeFileSync(
            path.join(bin, 'curl'),
            `#!/usr/bin/python3
import os,pathlib,sys
a=sys.argv[1:];u=a[a.index('-o')-1];n='release.json' if u.endswith('/latest') else u.rsplit('/',1)[1]
assert a[a.index('--proto')+1]=='=https'
pathlib.Path(a[a.index('-o')+1]).write_bytes((pathlib.Path(os.environ['QA_ROOT'])/n).read_bytes())
`,
            { mode: 0o700 },
        );
        const request = {
            t: 'node-upgrade',
            id: '00000000-0000-4000-8000-000000000001',
            directory,
            operation: 'install',
            netAdmin: false,
        };
        const script = nodeUpgradeScript(request, { port: 2222, secret });
        const run = () =>
            spawnSync('bash', ['-s'], {
                input: script,
                encoding: 'utf8',
                timeout: 20000,
                env: {
                    ...process.env,
                    PATH: bin + ':' + process.env.PATH,
                    QA_ROOT: root,
                    QA_MARKER: marker,
                },
            });
        try {
            assert.equal(spawnSync('bash', ['-n'], { input: script }).status, 0);
            assert.throws(() => nodeUpgradeScript(request), /Invalid installation context/);
            assert.throws(
                () => nodeUpgradeScript(request, { port: 22, secret }),
                /Invalid installation context/,
            );
            const success = run();
            assert.equal(success.status, 0, success.stderr);
            const args = fs.readFileSync(marker, 'utf8').trim().split('\n');
            assert.deepEqual(args.slice(0, -1), [
                'install-node',
                '--directory',
                directory,
                '--port',
                '2222',
                '--version',
                '9.9.9',
                '--no-net-admin',
                '--yes',
            ]);
            assert.equal(
                args.at(-1).split(' ')[0],
                createHash('sha256').update(secret).digest('hex'),
            );
            assert.equal((success.stdout + success.stderr).includes(secret), false);
            assert.equal(fs.existsSync(path.join(root, 'PWNED')), false);
            fs.unlinkSync(marker);
            fs.mkdirSync(directory);
            assert.equal(run().status, 0, 'an existing empty directory can be used for installation');
            assert.equal(fs.existsSync(marker), true);
            fs.unlinkSync(marker);
            fs.writeFileSync(path.join(directory, 'existing-configuration'), 'retain this file');
            assert.notEqual(run().status, 0);
            assert.equal(
                fs.existsSync(marker),
                false,
                'an occupied directory is never passed to install',
            );
            assert.equal(fs.readFileSync(path.join(directory, 'existing-configuration'), 'utf8'), 'retain this file');
            fs.unlinkSync(path.join(directory, 'existing-configuration'));
            fs.rmdirSync(directory);
            fs.writeFileSync(path.join(root, 'SHA256SUMS'), '0'.repeat(64) + '  installer.sh\n');
            assert.notEqual(run().status, 0);
            assert.equal(fs.existsSync(marker), false, 'a corrupted installer never runs');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    },
);

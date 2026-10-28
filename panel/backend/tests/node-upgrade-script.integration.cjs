// Exercises the generated remote script against fake release assets in a private WSL directory.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const load = require('./load-typescript.cjs');
assert.equal(process.env.NODE_INSTALL_TEST_WSL ?? process.env.NODE_INSTALL_TEST_LINUX, '1');
const { nodeUpgradeScript } = load(path.join(__dirname, '../src/modules/node-ssh/ssh/node-upgrade.ts'));
const base = `/tmp/remnacust-node-install-fixture-${process.pid}`;
const request = { t: 'node-upgrade', id: '00000000-0000-4000-8000-000000000001', operation: 'install', directory: `${base}/empty` };
const make = directory => Buffer.from(nodeUpgradeScript({ ...request, directory }, { port: 2222, secret: 'a'.repeat(64) })).toString('base64');
const metadata = JSON.stringify({ tag_name: 'v9.9.9', draft: false, prerelease: false, assets: ['installer.sh', 'SHA256SUMS'].map(name => ({ name, state: 'uploaded', browser_download_url: `https://github.com/lottman/Remnacust-installer/releases/download/v9.9.9/${name}` })) });
const shell = `set -Eeuo pipefail
fixture='${base}'
[[ ! -e "$fixture" && "$fixture" == /tmp/remnacust-node-install-fixture-* ]]
mkdir -p "$fixture/bin" "$fixture/empty" "$fixture/nonempty"
trap 'rm -rf -- "$fixture"' EXIT
export fixture
printf 'occupied' > "$fixture/nonempty/file"
ln -s "$fixture/empty" "$fixture/link"
printf '%s' '${Buffer.from(metadata).toString('base64')}' | base64 -d > "$fixture/release.json"
cat > "$fixture/installer.sh" <<'INSTALLER'
#!/bin/bash
[[ "$1" == install-node && -n "$REMNACUST_NODE_SECRET" ]] || exit 3
printf 'called\n' > "$fixture/called"
INSTALLER
sha256sum "$fixture/installer.sh" | sed 's|  .*|  installer.sh|' > "$fixture/SHA256SUMS"
cat > "$fixture/bin/curl" <<'CURL'
#!/bin/bash
set -eu
url='' out=''
while (($#)); do case "$1" in -o) out=$2;shift;; https://*) url=$1;; esac; shift; done
case "$url" in */releases/latest) source="$fixture/release.json";; */installer.sh) source="$fixture/installer.sh";; */SHA256SUMS) source="$fixture/SHA256SUMS";; *) exit 4;; esac
cp "$source" "$out"
CURL
chmod +x "$fixture/bin/curl"
export PATH="$fixture/bin:$PATH"
printf '%s' '${make(`${base}/empty`)}' | base64 -d > "$fixture/empty-test.sh"
printf '%s' '${make(`${base}/nonempty`)}' | base64 -d > "$fixture/nonempty-test.sh"
printf '%s' '${make(`${base}/link`)}' | base64 -d > "$fixture/link-test.sh"
bash "$fixture/empty-test.sh" > "$fixture/empty.out"
[[ -f "$fixture/called" ]]
if bash "$fixture/nonempty-test.sh" > "$fixture/nonempty.out"; then exit 6; fi
grep -q '^REMNACUST_NODE_UPGRADE_ERROR:directory$' "$fixture/nonempty.out"
if bash "$fixture/link-test.sh" > "$fixture/link.out"; then exit 7; fi
grep -q '^REMNACUST_NODE_UPGRADE_ERROR:directory$' "$fixture/link.out"
`;
const result = process.platform === 'win32'
    ? spawnSync('wsl.exe', ['-d', 'Ubuntu-24.04', '-u', 'root', '--', 'bash', '-s'], { input: shell, encoding: 'utf8', timeout: 30000 })
    : spawnSync('bash', ['-s'], { input: shell, encoding: 'utf8', timeout: 30000 });
assert.equal(result.status, 0, result.stderr || 'Node installation fixture failed');
console.log('PASS remote installer accepts an empty directory and rejects nonempty and symlink targets');

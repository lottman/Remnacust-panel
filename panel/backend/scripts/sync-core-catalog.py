"""Pin published native core artifacts after checking their source and downloaded bytes."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tag', required=True)
parser.add_argument('--commit', required=True)
args = parser.parse_args()
if not re.fullmatch(r'v\d+\.\d+\.\d+', args.tag) or not re.fullmatch(r'[a-f0-9]{40}', args.commit):
    parser.error('Use a version tag and the full pinned source commit')
repository = 'lottman/Remnacust-core'
api = 'https://api.github.com/repos/' + repository

def open_public(url):
    for attempt in range(3):
        try:
            return urlopen(url, timeout=15)
        except (URLError, TimeoutError, ConnectionError):
            if attempt == 2:
                raise
            time.sleep(attempt + 1)

def get_json(url):
    with open_public(url) as response:
        return json.load(response)

release = get_json(api + '/releases/tags/' + args.tag)
if release['draft'] or release['prerelease'] or release['tag_name'] != args.tag:
    raise ValueError('The core release is not published and stable')
reference = get_json(api + '/git/ref/tags/' + args.tag)['object']
if reference['type'] == 'tag':
    reference = get_json(api + '/git/tags/' + reference['sha'])['object']
if reference['type'] != 'commit' or reference['sha'] != args.commit:
    raise ValueError('Published core tag differs from the pinned source commit')
assets = {asset['name']: asset for asset in release['assets'] if asset['state'] == 'uploaded'}
base = f'https://github.com/{repository}/releases/download/{args.tag}/'
with open_public(base + 'SHA256SUMS') as response:
    checksum_bytes = response.read(16 * 1024 + 1)
if len(checksum_bytes) > 16 * 1024:
    raise ValueError('Checksum file exceeds the catalog limit')
if assets['SHA256SUMS']['digest'] != 'sha256:' + hashlib.sha256(checksum_bytes).hexdigest():
    raise ValueError('Published checksum file digest differs')
checksums = dict((line.split()[1], line.split()[0]) for line in checksum_bytes.decode().splitlines())
version = args.tag[1:]
entry = {'id': 'remnacust-core-' + version, 'build': version, 'sourceCommit': args.commit, 'artifacts': {}}
for arch, machine in [('amd64', 62), ('arm64', 183)]:
    name = f'remnacust-core-{version}-linux-{arch}'
    digest = checksums[name]
    if not re.fullmatch(r'[a-f0-9]{64}', digest) or assets[name]['digest'] != 'sha256:' + digest:
        raise ValueError('Published binary digest differs: ' + arch)
    hasher = hashlib.sha256()
    total = 0
    with open_public(base + name) as response:
        target = urlparse(response.url)
        if target.scheme != 'https' or target.hostname not in {'github.com', 'release-assets.githubusercontent.com'}:
            raise ValueError('Unexpected binary storage host')
        header = response.read(20)
        if len(header) != 20 or header[:6] != b'\x7fELF\x02\x01' or int.from_bytes(header[18:20], 'little') != machine:
            raise ValueError('Binary architecture differs: ' + arch)
        hasher.update(header)
        total += len(header)
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > 128 * 1024 * 1024:
                raise ValueError('Core binary exceeds the download limit')
            hasher.update(chunk)
    if hasher.hexdigest() != digest or total != assets[name]['size']:
        raise ValueError('Downloaded binary differs: ' + arch)
    entry['artifacts'][arch] = {'url': base + name, 'sha256': digest}
    print('Verified public core binary:', version, arch, digest)
output = Path(__file__).resolve().parents[1] / 'src/modules/core-management/core-releases.json'
output.write_text(json.dumps([entry], indent=2) + '\n', encoding='utf-8')
print('Pinned catalog:', output)

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const manifestSha256 = 'ed60b350e8422f97530acedf0b3ac8778ffac1c9249fc57df2110690eafb5c89'

export function verifyDefaultEditorProvenance(
    readAsset = (name) => readFileSync(new URL(`./public/assets/${name}`, import.meta.url))
) {
    const provenance = JSON.parse(readAsset('xray.default.provenance.json'))
    if (
        provenance.flavor !== 'default' ||
        provenance.upstreamVersion !== 'v26.11.9' ||
        provenance.upstreamCommit !== '676eaf66f8f05d4d558ee7a74b4736623d3feeb9' ||
        provenance.sourceArchiveSha256 !==
            'eab6fad20dfabc862c2537552e136e195de93d166c9a0bab72e408b4295eb7dc' ||
        provenance.configurationSourceSha256 !==
            '01666deb53beae1df9df9fccbca8e807dc7405996cc8a368c1be6713c26e7cba' ||
        !provenance.goVersion?.startsWith('go version go1.27.4 ')
    )
        throw new Error('Stale default editor source provenance')
    const { manifestSha256: recordedHash, ...manifest } = provenance.dependencySecurityUpdates ?? {}
    if (
        recordedHash !== manifestSha256 ||
        sha256(JSON.stringify(manifest, null, 2) + '\n') !== manifestSha256 ||
        manifest.policy !== 'official-baseline-with-security-dependency-updates' ||
        manifest.upstreamCommit !== provenance.upstreamCommit ||
        manifest.configurationSourceSha256 !== provenance.configurationSourceSha256
    )
        throw new Error('Default editor security dependency manifest integrity mismatch')
    for (const name of ['default.wasm', 'xray.default.schema.json', 'xray.default.schema.cn.json']) {
        if (provenance.files?.[name] !== sha256(readAsset(name)))
            throw new Error(`Default editor asset integrity mismatch: ${name}`)
    }
    return provenance
}

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const EDITOR_ASSETS = [
    'main.wasm',
    'wasm_exec.js',
    'xray.schema.json',
    'xray.schema.cn.json'
]

export function editorAssetVersions(
    readAsset = (name) => readFileSync(new URL(`./public/assets/${name}`, import.meta.url))
) {
    return Object.fromEntries(
        EDITOR_ASSETS.map((name) => [
            name,
            createHash('sha256').update(readAsset(name)).digest('hex')
        ])
    )
}

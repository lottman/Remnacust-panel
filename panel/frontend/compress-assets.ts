import type { Plugin } from 'vite'

import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'

const compress = promisify(gzip)

export async function compressAssets(directory: string): Promise<void> {
    // Sequential compression bounds peak memory when processing the large Xray WASM.
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) await compressAssets(path)
        else if (entry.isFile() && /\.(?:js|css|wasm|json|svg|html)$/.test(entry.name)) {
            const source = await readFile(path)
            if (source.length < 1024) {
                await rm(`${path}.gz`, { force: true })
                continue
            }
            const compressed = await compress(source, { level: 6 })
            if (compressed.length < source.length) await writeFile(`${path}.gz`, compressed)
            else await rm(`${path}.gz`, { force: true })
        }
    }
}

export function compressedAssets(): Plugin {
    let directory = ''
    return {
        name: 'xera-compressed-assets',
        apply: 'build',
        configResolved(config) {
            directory = resolve(config.root, config.build.outDir)
        },
        async closeBundle() {
            await compressAssets(directory)
        }
    }
}

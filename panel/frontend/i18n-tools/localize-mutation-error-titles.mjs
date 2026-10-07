import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../src/shared/api/hooks/', import.meta.url))
let changed = 0

async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
            await visit(path)
            continue
        }
        if (!/\.tsx?$/.test(entry.name)) continue

        const original = await readFile(path, 'utf8')
        let context = ''
        const lines = original.split('\n')
        const updated = lines.map((line) => {
            if (/\bonSuccess\s*:/.test(line)) context = 'success'
            if (/\bonError\s*:/.test(line)) context = 'error'
            const title = /\btitle: (`[^`]+`|'[^']+')/.exec(line)
            if (!title) return line
            if (line.includes('${') || (context !== 'error' && context !== 'success')) {
                throw new Error(`Unexpected error title in ${path}: ${line}`)
            }
            changed++
            const key = context === 'error' ? 'error' : 'success'
            return line.replace(title[0], `title: i18next.t('common.message.${key}')`)
        }).join('\n')
        if (updated === original) continue
        const withImport = updated.includes("import i18next from 'i18next'")
            ? updated
            : `import i18next from 'i18next'\n${updated}`
        await writeFile(path, withImport)
    }
}

await visit(root)
console.log(`Localized ${changed} mutation error titles.`)

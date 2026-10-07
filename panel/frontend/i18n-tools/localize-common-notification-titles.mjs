import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../src/', import.meta.url))
const titles = {
    Success: 'common.message.success',
    Error: 'common.message.error',
    Processing: 'common.message.processing'
}

async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
            await visit(path)
            continue
        }
        if (!/\.tsx?$/.test(entry.name)) continue

        const original = await readFile(path, 'utf8')
        let updated = original.replace(/\btitle: '(Success|Error|Processing)'/g, (match, title) =>
            match.replace(`'${title}'`, `i18next.t('${titles[title]}')`)
        )
        if (path.includes(join('shared', 'api', 'hooks'))) {
            updated = updated.replaceAll(
                '`Request failed with unknown error.`',
                "i18next.t('common.message.unknown-error')"
            )
        }
        if (updated === original) continue
        if (!/import i18next from 'i18next'/.test(updated)) {
            updated = `import i18next from 'i18next'\n${updated}`
        }
        await writeFile(path, updated)
        process.stdout.write(`${path}\n`)
    }
}

await visit(root)

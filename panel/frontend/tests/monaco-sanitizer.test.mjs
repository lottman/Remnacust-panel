import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import test from 'node:test'

test('Monaco embedded sanitizer resolves to the patched runtime', async () => {
    const server = await createServer({
        server: { middlewareMode: true },
        appType: 'custom'
    })
    try {
        const importer = fileURLToPath(new URL('../node_modules/monaco-editor/esm/vs/base/browser/domSanitize.js', import.meta.url))
        const source = await readFile(importer, 'utf8')
        const specifier = source.match(/import\s+\w+\s+from\s+['"]([^'"]*dompurify[^'"]*)['"]/u)?.[1]
        assert.ok(specifier, 'Monaco sanitizer dependency must be reviewed when its import changes')
        const resolved = await server.pluginContainer.resolveId(specifier, importer)
        assert.equal(resolved?.id.replaceAll('\\', '/'), fileURLToPath(new URL('../src/shared/lib/monaco-dompurify.ts', import.meta.url)).replaceAll('\\', '/'))
        const module = await server.ssrLoadModule(resolved.id)
        assert.equal(module.default.version, '3.4.17')
    } finally {
        await server.close()
    }
})

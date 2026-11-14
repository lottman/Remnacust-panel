import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const here = fileURLToPath(new URL('.', import.meta.url))
const src = fileURLToPath(new URL('../../../src/', import.meta.url))
export default defineConfig({
    root: here,
    cacheDir: here + '../../../node_modules/.vite-remarks-fixture',
    plugins: [react()],
    resolve: {
        alias: [
            { find: /^@remnawave\/backend-contract$/, replacement: here + 'contract.ts' },
            { find: /^@shared\/api\/hooks$/, replacement: here + 'browser-support.ts' },
            { find: /^@shared\/hooks$/, replacement: here + 'browser-support.ts' },
            {
                find: /^@shared\/ui\/appearance\/appearance$/,
                replacement: here + 'browser-support.ts'
            },
            { find: '@shared', replacement: src + 'shared' },
            { find: '@widgets', replacement: src + 'widgets' },
            { find: '@entities', replacement: src + 'entities' },
            { find: '@features', replacement: src + 'features' }
        ]
    },
    server: { fs: { allow: [fileURLToPath(new URL('../../../../../', import.meta.url))] } }
})

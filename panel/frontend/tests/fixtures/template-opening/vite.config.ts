import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

import { editorAssetVersions } from '../../../editor-assets.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const src = fileURLToPath(new URL('../../../src/', import.meta.url))
export default defineConfig({
    root: here,
    publicDir: fileURLToPath(new URL('../../../public/', import.meta.url)),
    cacheDir: here + '../../../node_modules/.vite-template-opening-fixture',
    plugins: [react()],
    optimizeDeps: { include: ['@remnawave/backend-contract'] },
    define: { __EDITOR_ASSET_VERSIONS__: JSON.stringify(editorAssetVersions()) },
    resolve: {
        alias: [
            {
                find: /^@features\/dashboard\/subscription-templates\/template-editor-actions$/,
                replacement: here + 'support.tsx'
            },
            {
                find: /^@shared\/hooks(?:\/use-editor-recovery)?$/,
                replacement: here + 'support.tsx'
            },
            {
                find: /^@shared\/ui(?:\/appearance\/appearance)?$/,
                replacement: here + 'support.tsx'
            },
            { find: /^@shared\/api$/, replacement: here + 'support.tsx' },
            {
                find: /^(?:@shared\/api\/hooks\/|\.\/shared\/api\/hooks\/)xray-mode$/,
                replacement: here + 'support.tsx'
            },
            {
                find: /^@shared\/api\/hooks\/subscription-settings\/subscription-settings.query.hooks$/,
                replacement: here + 'support.tsx'
            },
            {
                find: /^\.\/dompurify\/dompurify\.js$/,
                replacement: src + 'shared/lib/monaco-dompurify.ts'
            },
            { find: /^monaco-editor\/esm\/vs\/(.*)$/, replacement: 'monaco-editor/$1' },
            { find: 'src/config', replacement: src + 'config.ts' },
            { find: '@shared', replacement: src + 'shared' },
            { find: '@widgets', replacement: src + 'widgets' },
            { find: '@entities', replacement: src + 'entities' },
            { find: '@features', replacement: src + 'features' }
        ]
    },
    server: {
        host: '127.0.0.1',
        port: 4337,
        strictPort: true,
        fs: { allow: [fileURLToPath(new URL('../../../../../', import.meta.url))] }
    }
})

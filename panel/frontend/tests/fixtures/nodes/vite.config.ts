import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const here = fileURLToPath(new URL('.', import.meta.url))
const src = fileURLToPath(new URL('../../../src/', import.meta.url))
export default defineConfig({
    root: here,
    cacheDir: here + '../../../node_modules/.vite-nodes-fixture',
    plugins: [react()],
    resolve: {
        alias: [
            {
                find: /^@remnawave\/backend-contract$/,
                replacement: fileURLToPath(
                    new URL('../../../../backend/libs/contract/index.ts', import.meta.url)
                )
            },
            { find: /^@shared\/api\/hooks$/, replacement: here + 'browser-support.ts' },
            { find: /^@shared\/hooks$/, replacement: here + 'browser-support.ts' },
            { find: /^@shared\/_modals\/show-modal$/, replacement: here + 'browser-support.ts' },
            { find: /^@shared\/ui$/, replacement: here + 'browser-ui.ts' },
            { find: '@shared', replacement: src + 'shared' },
            { find: '@widgets', replacement: src + 'widgets' },
            { find: '@entities', replacement: src + 'entities' },
            { find: '@features', replacement: src + 'features' }
        ]
    },
    server: {
        host: '127.0.0.1',
        port: 4317,
        strictPort: true,
        cors: false,
        allowedHosts: ['localhost'],
        fs: { allow: [fileURLToPath(new URL('../../../../../', import.meta.url))] }
    }
})

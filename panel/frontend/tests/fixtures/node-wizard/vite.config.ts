import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const here = fileURLToPath(new URL('.', import.meta.url))
const src = fileURLToPath(new URL('../../../src/', import.meta.url))
export default defineConfig({
    root: here,
    publicDir: fileURLToPath(new URL('../../../public/', import.meta.url)),
    cacheDir: fileURLToPath(
        new URL('../../../node_modules/.vite-node-wizard-fixture/', import.meta.url)
    ),
    plugins: [react()],
    define: { __EDITOR_ASSET_VERSIONS__: '{}' },
    resolve: {
        alias: [
            { find: /^@mantine\/form$/, replacement: here + 'form-observer.ts' },
            {
                find: /^@remnawave\/backend-contract$/,
                replacement: fileURLToPath(
                    new URL('../../../../backend/libs/contract/index.ts', import.meta.url)
                )
            },
            { find: /^@shared\/api(?:\/hooks)?$/, replacement: here + 'api.ts' },
            {
                find: /^(?:@shared\/api\/hooks\/|\.\/shared\/api\/hooks\/)xray-mode$/,
                replacement: here + 'api.ts'
            },
            { find: 'src/config', replacement: src + 'config.ts' },
            { find: '@shared', replacement: src + 'shared' },
            { find: '@widgets', replacement: src + 'widgets' },
            { find: '@entities', replacement: src + 'entities' },
            { find: '@features', replacement: src + 'features' }
        ]
    },
    server: {
        host: '127.0.0.1',
        port: 4347,
        strictPort: true,
        cors: false,
        watch: { ignored: ['**/.browser-profile-*/**', '**/.vite-cache/**'] },
        fs: { allow: [fileURLToPath(new URL('../../../../../', import.meta.url))] }
    }
})

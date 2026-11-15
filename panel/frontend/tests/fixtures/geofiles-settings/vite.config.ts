import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const here = fileURLToPath(new URL('.', import.meta.url))
const src = fileURLToPath(new URL('../../../src/', import.meta.url))

export default defineConfig({
    root: here,
    publicDir: false,
    cacheDir: fileURLToPath(
        new URL('../../../node_modules/.vite-geofiles-settings-fixture/', import.meta.url)
    ),
    plugins: [
        {
            name: 'synthetic-settings-mutation-boundary',
            enforce: 'pre',
            resolveId(id, importer) {
                if (
                    id === '../../tsq-helpers' &&
                    importer
                        ?.replaceAll('\\', '/')
                        .endsWith('/subscription-settings.mutation.hooks.ts')
                )
                    return here + 'mutation-hook.ts'
            }
        },
        react()
    ],
    define: { __EDITOR_ASSET_VERSIONS__: '{}' },
    optimizeDeps: { include: ['@remnawave/backend-contract'] },
    resolve: {
        alias: [
            { find: /^@shared\/api(?:\/hooks)?$/, replacement: here + 'api.ts' },
            {
                find: /^@shared\/api\/hooks\/subscription-settings\/subscription-settings\.(?:query|mutation)\.hooks$/,
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
        port: 4349,
        strictPort: true,
        cors: false,
        fs: { allow: [fileURLToPath(new URL('../../../', import.meta.url))] }
    }
})

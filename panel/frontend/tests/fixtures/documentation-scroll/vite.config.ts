import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const here = fileURLToPath(new URL('.', import.meta.url))
const src = fileURLToPath(new URL('../../../src/', import.meta.url))

export default defineConfig({
    root: here,
    publicDir: fileURLToPath(new URL('../../../public/', import.meta.url)),
    cacheDir: here + '.vite',
    plugins: [react()],
    optimizeDeps: { include: ['@remnawave/backend-contract'] },
    define: {
        __LOCALE_VERSION__: JSON.stringify('documentation-scroll-fixture'),
        __EDITOR_ASSET_VERSIONS__: '{}',
        __DOMAIN_BACKEND__: JSON.stringify('http://127.0.0.1:4351'),
        __DOMAIN_OVERRIDE__: JSON.stringify('0'),
        __NODE_ENV__: JSON.stringify('development')
    },
    resolve: {
        alias: [
            { find: 'src/config', replacement: src + 'config.ts' },
            { find: '@shared', replacement: src + 'shared' },
            { find: '@widgets', replacement: src + 'widgets' },
            { find: '@entities', replacement: src + 'entities' },
            { find: '@features', replacement: src + 'features' },
            { find: '@pages', replacement: src + 'pages' }
        ]
    },
    server: {
        host: '127.0.0.1',
        port: 4351,
        strictPort: true,
        cors: false,
        hmr: false,
        watch: { ignored: ['**/.browser-profile-*/**', '**/.vite/**'] },
        fs: { allow: [fileURLToPath(new URL('../../../', import.meta.url))] }
    }
})

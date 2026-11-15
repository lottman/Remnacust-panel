import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const here = fileURLToPath(new URL('.', import.meta.url))
const src = fileURLToPath(new URL('../../../src/', import.meta.url))
export default defineConfig({
    root: here,
    publicDir: false,
    cacheDir: here + '../../../node_modules/.vite-node-scan-fixture',
    plugins: [react()],
    define: {
        __DOMAIN_BACKEND__: JSON.stringify('http://127.0.0.1:4348'),
        __NODE_ENV__: JSON.stringify('development'),
        __DOMAIN_OVERRIDE__: JSON.stringify('1')
    },
    resolve: {
        alias: [
            {
                find: /^@remnawave\/backend-contract$/,
                replacement: fileURLToPath(
                    new URL('../../../../backend/libs/contract/index.ts', import.meta.url)
                )
            },
            { find: '../../tsq-helpers', replacement: here + 'mutation-support.ts' },
            { find: '@shared', replacement: src + 'shared' }
        ]
    },
    server: {
        host: '127.0.0.1',
        port: 4348,
        strictPort: true,
        cors: false,
        fs: { allow: [fileURLToPath(new URL('../../../../../', import.meta.url))] }
    }
})

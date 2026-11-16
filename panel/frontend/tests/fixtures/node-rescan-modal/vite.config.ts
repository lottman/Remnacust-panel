import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const here = fileURLToPath(new URL('.', import.meta.url))
const src = fileURLToPath(new URL('../../../src/', import.meta.url))
export default defineConfig({
    root: here,
    publicDir: fileURLToPath(new URL('../../../public/', import.meta.url)),
    cacheDir: here + '.vite-cache',
    plugins: [
        {
            name: 'baseline-rescan',
            enforce: 'pre',
            load(id) {
                if (process.env.NODE_RESCAN_BASELINE !== '1') return null
                const relative = id.replaceAll('\\', '/').split('/panel/frontend/')[1]
                if (
                    relative &&
                    [
                        'src/shared/_modals/nodes/edit-node-modal/edit-node.modal.content.tsx',
                        'src/shared/ui/forms/nodes/base-node-form/base-node-form.tsx',
                        'src/shared/ui/forms/nodes/base-node-form/node-ips.card.tsx',
                        'src/shared/ui/node-ips/node-control-addresses-editor.tsx'
                    ].includes(relative)
                )
                    return execFileSync(
                        'git',
                        [
                            'show',
                            '294451c32f74cd5514c689af660cd790faa4dc8e:panel/frontend/' + relative
                        ],
                        { encoding: 'utf8' }
                    )
            }
        },
        react()
    ],
    define: { __EDITOR_ASSET_VERSIONS__: '{}' },
    resolve: {
        alias: [
            { find: /^@features\/.*/, replacement: here + 'features.tsx' },
            { find: /^@widgets\/.*/, replacement: here + 'features.tsx' },
            { find: /^@mantine\/form$/, replacement: here + '../node-wizard/form-observer.ts' },
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
            {
                find: /^@shared\/api\/hooks\/nodes\/nodes.query.hooks$/,
                replacement: here + 'api.ts'
            },
            { find: /^@shared\/api\/axios$/, replacement: here + 'api.ts' },
            { find: 'src/config', replacement: src + 'config.ts' },
            { find: '@shared', replacement: src + 'shared' },
            { find: '@widgets', replacement: src + 'widgets' },
            { find: '@entities', replacement: src + 'entities' },
            { find: '@features', replacement: src + 'features' }
        ]
    },
    server: {
        host: '127.0.0.1',
        port: 4359,
        strictPort: true,
        cors: false,
        watch: { ignored: ['**/.browser-profile-*/**', '**/.vite-cache/**'] },
        fs: { allow: [fileURLToPath(new URL('../../../../../', import.meta.url))] }
    }
})

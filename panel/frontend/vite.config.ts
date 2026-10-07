import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
// import { splashScreen } from 'vite-plugin-splash-screen'
// import { visualizer } from 'rollup-plugin-visualizer'
// import deadFile from 'vite-plugin-deadfile'
import removeConsole from 'vite-plugin-remove-console'
import webfontDownload from 'vite-plugin-webfont-dl'
import 'dotenv/config'

import { compressedAssets } from './compress-assets'

const localeVersion = createHash('sha256')
for (const language of ['en', 'ru', 'fa', 'zh']) {
    localeVersion.update(
        readFileSync(new URL(`./public/locales/${language}/remnawave.json`, import.meta.url))
    )
}
const localeHash = localeVersion.digest('hex').slice(0, 12)

export default defineConfig({
    assetsInclude: ['**/*.lottie'],
    plugins: [
        react(),
        compressedAssets(),
        removeConsole(),
        webfontDownload()
        // splashScreen({
        //     logoSrc: 'favicons/logo_small.svg',
        //     splashBg: '#161B23'
        // })
        // visualizer({
        //     open: true,
        //     gzipSize: true,
        //     brotliSize: true
        // })
        // deadFile({
        //     include: ['src/**/*.{js,jsx,ts,tsx}'],
        //     exclude: ['node_modules/**', /\.md$/i, 'public/**', 'dist/**', '.git/**', '.vscode/**']
        // })
    ],
    optimizeDeps: {
        include: [
            '@remnawave/backend-contract',
            'html-parse-stringify',
            'monaco-editor/editor',
            'monaco-editor/features/bracketMatching/register',
            'monaco-editor/features/clipboard/register',
            'monaco-editor/features/codeEditor/register',
            'monaco-editor/features/comment/register',
            'monaco-editor/features/contextmenu/register',
            'monaco-editor/features/find/register',
            'monaco-editor/features/folding/register',
            'monaco-editor/features/format/register',
            'monaco-editor/features/gotoError/register',
            'monaco-editor/features/hover/register',
            'monaco-editor/features/indentation/register',
            'monaco-editor/features/linesOperations/register',
            'monaco-editor/features/links/register',
            'monaco-editor/features/multicursor/register',
            'monaco-editor/features/suggest/register',
            'monaco-editor/editor/contrib/suggest/browser/suggestController',
            'monaco-editor/features/wordOperations/register',
            'monaco-editor/languages/definitions/yaml/yaml',
            'monaco-editor/languages/features/json/register'
        ]
    },
    build: {
        target: 'esnext',
        outDir: 'dist',
        chunkSizeWarningLimit: 1000000,
        rollupOptions: {
            preserveEntrySignatures: false,
            onwarn(warning, defaultHandler) {
                if (warning.code === 'COMMONJS_VARIABLE_IN_ESM') return
                defaultHandler(warning)
            },
            output: {
                strictExecutionOrder: true,
                codeSplitting: {
                    groups: [
                        {
                            name: 'react',
                            test: /node_modules[\\/](react|react-dom|react-router|react-error-boundary)[\\/]/
                        },
                        {
                            name: 'markdown',
                            test: /node_modules[\\/](react-markdown|remark-gfm|rehype-raw)[\\/]/
                        },
                        {
                            name: 'icons',
                            test: /node_modules[\\/]react-icons[\\/]/
                        },
                        {
                            name: 'zod',
                            test: /node_modules[\\/](axios|zod|zustand|xbytes|zod-to-json-schema)[\\/]/
                        },
                        {
                            name: 'utils',
                            test: /node_modules[\\/](nanoid|ufo|consola|semver|is-svg|sax|jsonc-parser|json-edit-react|dayjs)[\\/]/
                        },
                        {
                            name: 'mantine',
                            test: /node_modules[\\/]@mantine[\\/](core|hooks|dates|nprogress|notifications|modals)[\\/]/
                        },
                        {
                            name: 'remnawave',
                            test: /node_modules[\\/]@remnawave[\\/](backend-contract|subscription-page-types)[\\/]/
                        },
                        {
                            name: 'i18n',
                            test: /node_modules[\\/](i18next|i18next-http-backend|i18next-browser-languagedetector)[\\/]/
                        },
                        {
                            name: 'motion',
                            test: /node_modules[\\/](framer-motion|motion|motion-dom|motion-utils)[\\/]/
                        },
                        {
                            name: 'crypto',
                            test: /node_modules[\\/]@stablelib[\\/](base64|x25519)[\\/]/
                        },
                        {
                            name: 'charts',
                            includeDependenciesRecursively: false,
                            test: /node_modules[\\/](recharts|highcharts|@highcharts[\\/]react)[\\/]/
                        },
                        {
                            name: 'dnd',
                            test: /node_modules[\\/]@dnd-kit[\\/](abstract|dom|helpers|react)[\\/]/
                        },
                        {
                            name: 'mantinetable',
                            includeDependenciesRecursively: false,
                            test: /node_modules[\\/](@kastov[\\/]mantine-react-table-open|mantine-datatable)[\\/]/
                        },
                        {
                            name: 'prettier',
                            includeDependenciesRecursively: false,
                            test: /node_modules[\\/](prettier|vscode-languageserver-types)[\\/]/
                        },
                        {
                            name: 'editor-options',
                            includeDependenciesRecursively: false,
                            test: /src[\\/]shared[\\/]constants[\\/]monaco-theme[\\/]/
                        },
                        {
                            name: 'monaco',
                            includeDependenciesRecursively: false,
                            test: /node_modules[\\/](monaco-editor|monaco-yaml|yaml)[\\/]/
                        },
                        {
                            name: 'tanstack',
                            test: /node_modules[\\/]@tanstack[\\/](react-query|react-table|react-virtual)[\\/]/
                        },
                        {
                            name: 'xterm',
                            test: /node_modules[\\/]@xterm[\\/]/
                        }
                    ]
                }
            }
        }
    },
    define: {
        __LOCALE_VERSION__: JSON.stringify(localeHash),
        __DOMAIN_BACKEND__: JSON.stringify(process.env.DOMAIN_BACKEND || 'example.com').trim(),
        __NODE_ENV__: JSON.stringify(process.env.NODE_ENV).trim(),
        __DOMAIN_OVERRIDE__: JSON.stringify(process.env.DOMAIN_OVERRIDE || '0').trim()
    },
    server: {
        host: '127.0.0.1',
        port: 3333,
        cors: false,
        strictPort: true,
        allowedHosts: ['localhost'],
        hmr: {
            overlay: false
        }
    },
    resolve: {
        tsconfigPaths: true,
        alias: [
            {
                find: /^monaco-editor\/esm\/vs\/(.*)$/,
                replacement: 'monaco-editor/$1'
            }
        ]
    }
})

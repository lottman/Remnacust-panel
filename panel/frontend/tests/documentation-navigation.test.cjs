const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { MemoryRouter } = require('react-router')
const { MantineProvider } = require('@mantine/core')

function load() {
    const exports = {}
    const source = fs.readFileSync(path.join(__dirname, '../src/pages/dashboard/documentation/documentation-shell.tsx'), 'utf8')
        .replaceAll('import.meta.env.BASE_URL', "'/'")
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true
    } }).outputText, { exports, require(name) {
        if (name === 'react-i18next') return { useTranslation: (_, options) => ({
            i18n: { resolvedLanguage: 'en' }, t: key => (options?.lng ?? 'en') + ':' + key
        }) }
        if (name === '@shared/constants') return { ROUTES: { DASHBOARD: { DOCUMENTATION: { GUIDE: '/guide', API: '/api', VERSIONS: '/versions' } } } }
        if (name.endsWith('.module.css')) return { default: {} }
        if (name === '@shared/ui/page-header/page-header.shared') return { PageHeaderShared: ({ title, actions }) => React.createElement('header', null, title, actions) }
        return require(name)
    }, URL })
    return exports
}

test('all documentation modes retain the selected language in every tab and expose a language control', () => {
    const { DocumentationLocale, DocumentationToolbar, DocumentationHeader } = load()
    for (const language of ['en', 'ru', 'fa', 'zh']) {
        for (const mode of ['guide', 'api', 'versions']) {
            const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/guide?language=' + language] },
                React.createElement(MantineProvider, null, React.createElement(DocumentationLocale, null,
                    React.createElement(DocumentationHeader, { mode }), React.createElement(DocumentationToolbar, { mode })))
            ))
            assert.ok(html.includes('href="/guide?language=' + language + '"'))
            assert.ok(html.includes('href="/api?language=' + language + '"'))
            assert.ok(html.includes('href="/versions?language=' + language + '"'))
            assert.ok(html.includes('aria-label="' + language + ':documentation.language"'))
            assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1)
            assert.ok(html.includes(language + ':documentation.title'))
        }
    }
})

test('unsupported document languages fall back to English', () => {
    const { DocumentationLocale, DocumentationToolbar } = load()
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/guide?language=invalid'] },
        React.createElement(MantineProvider, null, React.createElement(DocumentationLocale, null, React.createElement(DocumentationToolbar, { mode: 'api' })))
    ))
    assert.ok(html.includes('href="/api?language=en"'))
})

test('desktop and mobile menus expose three distinct documentation destinations', () => {
    const routes = {}
    const compile = (source, exports, resolve) => vm.runInNewContext(ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
    }).outputText, { exports, require: resolve })
    compile(fs.readFileSync(path.join(__dirname, '../src/shared/constants/routes.ts'), 'utf8'), routes, require)
    for (const variant of ['desktop', 'mobile']) {
        const exports = {}
        compile(fs.readFileSync(path.join(__dirname, '../src/app/layouts/dashboard/main-layout/menu-sections/' + variant + '-menu-sections.ts'), 'utf8'), exports, name => {
            if (name === 'react-i18next') return { useTranslation: () => ({ t: key => key }) }
            if (name === '@shared/constants') return routes
            if (name === '@shared/ui' || name === '@shared/ui/logos') return {}
            return require(name)
        })
        let menu
        function Capture() {
            menu = exports[variant === 'desktop' ? 'useDesktopMenuSections' : 'useMobileMenuSections']()
            return null
        }
        renderToStaticMarkup(React.createElement(Capture))
        const documentation = variant === 'desktop'
            ? menu.find(section => section.id === 'documentation').section
            : menu.flatMap(section => section.section).find(item => item.id === 'documentation').dropdownItems
        const destinations = Object.values(routes.ROUTES.DASHBOARD.DOCUMENTATION).slice(1)
        assert.equal(documentation.length, 3)
        assert.deepEqual(Array.from(documentation, item => item.href), destinations)
        assert.ok(documentation.every(item => typeof item.icon === 'function'))
        for (const pathname of destinations) {
            assert.equal(documentation.filter(item => require('react-router').matchPath({ path: item.href, end: false }, pathname)).length, 1)
        }
    }
})

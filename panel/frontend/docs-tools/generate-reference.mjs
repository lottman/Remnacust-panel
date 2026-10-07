import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

import { fieldDescriptions } from './field-descriptions.mjs'
import { operatorFieldHelp } from './operator-field-help.mjs'
import { panelFieldArticleIds } from './production-guide.mjs'
import { fieldLocales, variableLocales } from './reference-locales.mjs'
import { describeVariable } from './variable-descriptions.mjs'

const root = path.resolve(import.meta.dirname, '..')
const backend = path.resolve(
    root,
    fs.existsSync(path.resolve(root, '../backend')) ? '../backend' : '../backend-3.4.4-xera'
)
const output = path.join(root, 'public/documentation')
fs.mkdirSync(output, { recursive: true })
const registry = JSON.parse(fs.readFileSync(path.join(output, 'registry.json'), 'utf8'))
const spec = JSON.parse(fs.readFileSync(path.join(backend, 'openapi.json'), 'utf8'))
const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']
const endpoints = Object.entries(spec.paths).flatMap(([url, item]) =>
    methods
        .filter((method) => item[method])
        .map((method) => {
            const operation = item[method]
            if (!operation['x-remnacust-access'])
                throw new Error(
                    `Regenerate backend OpenAPI: ${method} ${url} has no access metadata`
                )
            return { id: `${method}:${url}`, path: url, method: method.toUpperCase(), ...operation }
        })
)
if (endpoints.some((op) => op.path === '/api/hosts/tag-limits'))
    throw new Error('Deleted public tag-limit routes must not be documented')
const api = {
    version: spec.info.version,
    endpoints,
    schemas: spec.components?.schemas ?? {},
    securitySchemes: spec.components?.securitySchemes ?? {}
}
fs.writeFileSync(path.join(output, 'api.json'), JSON.stringify(api))
fs.writeFileSync(
    path.join(output, 'catalog.json'),
    JSON.stringify(
        endpoints.map(({ id, path, method, summary, tags, ...rest }) => ({
            id,
            path,
            method,
            summary,
            tags,
            ...Object.fromEntries(
                Object.entries(rest).filter(([key]) => key.startsWith('x-remnacust-'))
            )
        }))
    )
)
fs.writeFileSync(path.join(output, 'openapi.json'), JSON.stringify(spec))
const variableSource = fs.readFileSync(
    path.join(backend, 'src/common/utils/templates/template-variables.ts'),
    'utf8'
)
const variables = [...variableSource.matchAll(/^    ([A-Z][A-Z_0-9]+): \{ args: ([^}]+) \}/gm)].map(
    ([, name, args]) => ({
        name,
        description: { ...describeVariable(name), ...variableLocales(name) },
        args: args.includes('DATE_ARGS')
            ? ['format']
            : args.includes('USERS_STATUS_VALUES')
              ? ['ACTIVE', 'DISABLED', 'EXPIRED', 'LIMITED']
              : args.includes('RESET_PERIODS_VALUES')
                ? ['NO_RESET', 'DAY', 'WEEK', 'MONTH', 'MONTH_ROLLING']
                : []
    })
)
fs.writeFileSync(path.join(output, 'variables.json'), JSON.stringify(variables))

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const name = path.join(dir, entry.name)
        return entry.isDirectory() ? walk(name) : /\.(tsx?|prisma)$/.test(name) ? [name] : []
    })
}
const files = walk(path.join(root, 'src')).filter(
    (name) => !name.includes(`${path.sep}documentation${path.sep}`)
)
const byArticle = Object.fromEntries(registry.articles.map((article) => [article.id, []]))
const literal = (node) => (node && ts.isStringLiteralLike(node) ? node.text : undefined)
const translation = (node) => {
    if (!node) return undefined
    if (ts.isJsxExpression(node)) return translation(node.expression)
    if (ts.isCallExpression(node) && /^(t|uiText)$/.test(node.expression.getText())) {
        const key = literal(node.arguments[0])
        return key && node.expression.getText() === 'uiText' ? `interface.${key}` : key
    }
    return undefined
}
const inventory = []
for (const file of files) {
    const relative = path.relative(root, file).replaceAll('\\', '/')
    const source = fs.readFileSync(file, 'utf8')
    inventory.push({
        file: relative,
        sha256: crypto.createHash('sha256').update(source).digest('hex')
    })
    const articles = registry.articles.filter((article) =>
        article.sources.some((prefix) => relative.startsWith(prefix))
    )
    if (!articles.length || !file.endsWith('.tsx')) continue
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    function visit(node) {
        // Host options are data-driven controls, not JSX labels.
        if (ts.isObjectLiteralExpression(node)) {
            const property = (name) =>
                node.properties.find(
                    (p) => ts.isPropertyAssignment(p) && p.name.getText(ast) === name
                )?.initializer
            const labelKey = literal(property('labelKey'))
            const name = literal(property('name'))
            if (labelKey && name)
                for (const article of articles)
                    byArticle[article.id].push({
                        field: name,
                        labelKey,
                        descriptionKey: literal(property('helpKey')),
                        control: 'HostOption',
                        source: relative
                    })
        }
        if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
            const attrs = node.attributes.properties
            const attr = (name) =>
                attrs.find((a) => ts.isJsxAttribute(a) && a.name.getText(ast) === name)?.initializer
            let field = literal(attr('field'))
            for (const a of attrs) {
                if (!ts.isJsxSpreadAttribute(a)) continue
                const match = a.expression.getText(ast).match(/getInputProps\(['"]([^'"]+)['"]/)
                if (match) field = match[1]
            }
            const labelKey = translation(attr('label')) ?? translation(attr('title'))
            const descriptionKey = translation(attr('description'))
            const label = literal(attr('label'))
            if (field || (labelKey && descriptionKey)) {
                const min = attr('min')?.getText(ast).replace(/[{}]/g, '')
                const max = attr('max')?.getText(ast).replace(/[{}]/g, '')
                const control = {
                    field,
                    labelKey,
                    descriptionKey,
                    label,
                    min,
                    max,
                    control: node.tagName.getText(ast),
                    source: relative
                }
                for (const article of articles) byArticle[article.id].push(control)
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(ast)
}
for (const [id, controls] of Object.entries(byArticle)) {
    if (!panelFieldArticleIds.includes(id)) {
        byArticle[id] = []
        continue
    }
    const seen = new Set()
    byArticle[id] = controls.filter((control) => {
        const key = control.field
            ? control.field.replace(/^fields\./, '')
            : [control.labelKey, control.descriptionKey].join(':')
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
    for (const control of byArticle[id]) {
        const key = control.field?.replace(/^fields\./, '')
        const operatorHelp = operatorFieldHelp[key]
        if (operatorHelp) {
            control.explanation = Object.fromEntries(
                ['ru', 'en', 'fa', 'zh'].map((language, index) => [language, operatorHelp[index]])
            )
            continue
        }
        const description = fieldDescriptions[key]
        if (description) {
            const extra = fieldLocales[key]
            if (!extra) throw new Error(`Missing field translation: ${key}`)
            control.explanation = {
                ru: description[0],
                en: description[1],
                fa: extra[0],
                zh: extra[1]
            }
        }
    }
}
fs.writeFileSync(path.join(output, 'controls.json'), JSON.stringify(byArticle))
// Downloads contain the same field reference as the in-panel guide.
for (const language of ['ru', 'en', 'fa', 'zh']) {
    const dictionary = JSON.parse(
        fs.readFileSync(path.join(root, `public/locales/${language}/remnawave.json`), 'utf8')
    )
    const translate = (key) =>
        key?.split('.').reduce((node, part) => node?.[part], dictionary) ?? ''
    const clean = (text) => String(text).replace(/<\/?[a-z][^>]*>/gi, '')
    const content = JSON.parse(fs.readFileSync(path.join(output, `guide-${language}.json`), 'utf8'))
    const markdown =
        '# Remnacust\n\n' +
        content
            .map((article) => {
                const prose =
                    `## ${article.title}\n\n` +
                    article.sections
                        .map((section) => `### ${section.title}\n\n${section.body}`)
                        .join('\n\n')
                const fields = byArticle[article.id]
                    .filter((control) =>
                        (translate(control.labelKey) || control.label || '').trim()
                    )
                    .map(
                        (control) =>
                            `- **${clean(translate(control.labelKey) || control.label)}**: ${clean(control.explanation?.[language] || translate(control.descriptionKey))}`
                    )
                    .join('\n')
                return (
                    prose +
                    (fields ? `\n\n### ${translate('documentation.fields')}\n\n${fields}` : '')
                )
            })
            .join('\n\n') +
        '\n'
    fs.writeFileSync(path.join(output, `guide-${language}.md`), markdown)
}
const backendFiles = [
    ...walk(path.join(backend, 'src')),
    ...walk(path.join(backend, 'libs/contract')),
    ...walk(path.join(backend, 'prisma'))
]
for (const file of backendFiles)
    inventory.push({
        file: `backend/${path.relative(backend, file).replaceAll('\\', '/')}`,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    })
const manifest = {
    generatedAt: new Date().toISOString(),
    backendVersion: spec.info.version,
    coreVersion: '1.1.1',
    nodeVersion: '1.1.1',
    upstreamPanelVersion: '3.4.4',
    upstreamBackendPatches: [
        {
            commit: 'dec0fcca4e47f13e835ebe7466dab68911d03273',
            date: '2026-09-27',
            description: {
                ru: 'Параметр multiMode для gRPC в подписке Xray JSON',
                en: 'gRPC multiMode in Xray JSON subscriptions',
                fa: 'پارامتر multiMode برای gRPC در اشتراک Xray JSON',
                zh: 'Xray JSON 订阅中的 gRPC multiMode 参数'
            }
        },
        {
            commit: '814fb05460b0205a781635872e8934356e15185b',
            date: '2026-09-27',
            description: {
                ru: 'Точные фильтры ID пользователей и торрент-отчётов',
                en: 'Exact ID filters for users and torrent reports',
                fa: 'فیلتر دقیق شناسه کاربران و گزارش‌های تورنت',
                zh: '用户及种子报告的精确 ID 筛选'
            }
        }
    ],
    upstreamNodeVersion: '3.4.1',
    upstreamCoreVersion: '26.9.30',
    upstreamCoreCommit: 'b26a91de4f3294e26a0ad0a970b81a386a41f789',
    articles: registry.articles.length,
    endpoints: endpoints.length,
    apiTokenEndpoints: endpoints.filter((op) => op['x-remnacust-access'] === 'api-token').length,
    controls: Object.values(byArticle).reduce((count, list) => count + list.length, 0),
    sourceFiles: inventory.length,
    specSha256: crypto.createHash('sha256').update(JSON.stringify(spec)).digest('hex')
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2))
fs.mkdirSync(path.resolve(root, '../audit-documentation-20261001'), { recursive: true })
fs.writeFileSync(
    path.resolve(root, '../audit-documentation-20261001/source-inventory.json'),
    JSON.stringify(inventory, null, 2)
)
console.log(JSON.stringify(manifest))

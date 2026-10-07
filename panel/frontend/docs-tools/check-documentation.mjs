import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { panelArticleIds, panelFieldArticleIds } from './production-guide.mjs'

const root = path.resolve(import.meta.dirname, '..')
const output = path.join(root, 'public/documentation')
const read = (name) => JSON.parse(fs.readFileSync(path.join(output, name), 'utf8'))
const registry = read('registry.json')
const languages = ['ru', 'en', 'fa', 'zh']
const guides = Object.fromEntries(languages.map((lang) => [lang, read(`guide-${lang}.json`)]))
const controls = read('controls.json')
const variables = read('variables.json')
const catalog = read('catalog.json')
const api = read('api.json')
const spec = read('openapi.json')
const manifest = read('manifest.json')
const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(dir, entry.name)
        return entry.isDirectory() ? walk(file) : /\.(tsx?|prisma)$/.test(file) ? [file] : []
    })
const frontendSources = walk(path.join(root, 'src'))
    .filter((file) => !file.includes(`${path.sep}documentation${path.sep}`))
    .map((file) => path.relative(root, file).replaceAll('\\', '/'))
const ids = registry.articles.map((article) => article.id)
const unique = (values, label) =>
    assert.equal(new Set(values).size, values.length, `Duplicate ${label}`)

unique(ids, 'article ID')
assert.deepEqual(ids, panelArticleIds, 'Public guide must contain only panel workflows')
unique(
    registry.categories.map(({ id }) => id),
    'category ID'
)
const categorySet = new Set(registry.categories.map(({ id }) => id))
const routes = fs.readFileSync(path.join(root, 'src/shared/constants/routes.ts'), 'utf8')
for (const meta of registry.articles) {
    assert.ok(categorySet.has(meta.category), `${meta.id}: invalid category`)
    assert.ok(
        meta.route && routes.includes(`'${meta.route}'`),
        `${meta.id}: unknown panel route ${meta.route}`
    )
    unique(meta.sectionIds, `${meta.id} section ID`)
    for (const source of meta.sources)
        assert.ok(
            frontendSources.some((file) => file.startsWith(source)),
            `${meta.id}: missing source ${source}`
        )
    for (const language of languages) {
        const article = guides[language].find((entry) => entry.id === meta.id)
        assert.ok(article?.title, `${meta.id}: missing ${language} article`)
        assert.deepEqual(
            article.sections.map(({ id }) => id),
            meta.sectionIds
        )
        for (const section of article.sections) {
            assert.ok(
                section.title.trim() && section.body.trim(),
                `${meta.id}: empty ${language} section`
            )
            for (const [, destination] of section.body.matchAll(/\]\((\/dashboard\/[^)]+)\)/g))
                assert.ok(
                    routes.includes(`'${destination}'`),
                    `${meta.id}: broken destination ${destination}`
                )
        }
    }
    assert.ok(Array.isArray(controls[meta.id]), `${meta.id}: controls missing`)
    for (const control of controls[meta.id]) {
        assert.ok(
            control.explanation || control.descriptionKey,
            `${meta.id}: unexplained field ${control.field}`
        )
        if (control.explanation) {
            for (const language of languages)
                assert.ok(
                    control.explanation[language]?.trim(),
                    `${meta.id}: field ${control.field} has no ${language} explanation`
                )
        }
    }
    if (!panelFieldArticleIds.includes(meta.id))
        assert.equal(controls[meta.id].length, 0, `${meta.id}: unrelated form help`)
}
for (const language of languages) {
    assert.deepEqual(
        guides[language].map(({ id }) => id),
        ids
    )
    const download = fs.readFileSync(path.join(output, `guide-${language}.md`), 'utf8')
    assert.ok(download.length > 10000)
    assert.ok(
        !/\b(?:GET|POST|PUT|PATCH|DELETE) \/api\//.test(download),
        'API methods belong in the API reference'
    )
    assert.ok(
        !/olcRTC|panel-tag-limits|XERA_BACKUPS_DIR|XERA_PLAIN_DUMPS_DIR|WebAssembly|requestId|upstream|latest/i.test(
            download
        ),
        'Internal implementation notes must not enter public help'
    )
}
assert.equal(manifest.articles, ids.length)
assert.equal(
    manifest.controls,
    Object.values(controls).reduce((total, list) => total + list.length, 0)
)
assert.ok(manifest.sourceFiles >= frontendSources.length)

const backendRoot = path.resolve(
    root,
    fs.existsSync(path.resolve(root, '../backend')) ? '../backend' : '../backend-3.4.4-xera'
)
const variablePath = path.join(backendRoot, 'src/common/utils/templates/template-variables.ts')
if (fs.existsSync(variablePath)) {
    const sourceVars = fs.readFileSync(variablePath, 'utf8')
    const sourceNames = [...sourceVars.matchAll(/^    ([A-Z][A-Z_0-9]+): \{ args: /gm)].map(
        ([, name]) => name
    )
    assert.deepEqual(
        variables.map(({ name }) => name),
        sourceNames
    )
    unique(sourceNames, 'template variable')
}
unique(
    variables.map(({ name }) => name),
    'template variable'
)
for (const variable of variables) {
    assert.ok(
        languages.every((language) => variable.description[language]),
        `${variable.name}: missing explanation`
    )
    if (variable.name === 'RESET_STRATEGY') assert.ok(variable.args.includes('MONTH_ROLLING'))
}

const operations = Object.entries(spec.paths).flatMap(([url, methods]) =>
    ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']
        .filter((method) => methods?.[method])
        .map((method) => `${method}:${url}`)
)
assert.deepEqual(
    api.endpoints.map(({ id }) => id),
    operations
)
assert.deepEqual(
    catalog.map(({ id }) => id),
    operations
)
unique(operations, 'API operation')
assert.equal(manifest.endpoints, operations.length)
assert.equal(
    manifest.apiTokenEndpoints,
    api.endpoints.filter((op) => op['x-remnacust-access'] === 'api-token').length
)
assert.equal(
    manifest.specSha256,
    crypto.createHash('sha256').update(JSON.stringify(spec)).digest('hex')
)
assert.ok(!operations.some((id) => id.includes('/api/hosts/tag-limits')))
for (const op of api.endpoints) {
    assert.ok(op['x-remnacust-access'], `${op.id}: missing access type`)
    if (op['x-remnacust-access'] === 'api-token')
        assert.ok(
            op['x-remnacust-scope'] && op['x-remnacust-resource'] && op['x-remnacust-kind'],
            `${op.id}: missing token scope`
        )
}
for (const suffix of ['actions', 'selection-state', 'unlimited']) {
    const operation = api.endpoints.find((entry) => entry.id === `post:/api/limits/${suffix}`)
    assert.ok(
        operation?.requestBody?.content?.['application/json']?.schema,
        `limits/${suffix}: missing body`
    )
    assert.ok(
        operation?.responses?.['201']?.content?.['application/json']?.schema,
        `limits/${suffix}: missing response`
    )
}
const listUsers = api.endpoints.find((entry) => entry.id === 'get:/api/limits/users')
assert.deepEqual(
    listUsers.parameters.find(({ name }) => name === 'pageSize').schema.enum,
    [25, 50, 100]
)
const refErrors = []
const inspect = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(inspect)
    if (node.$ref?.startsWith('#/components/schemas/')) {
        const name = node.$ref.slice('#/components/schemas/'.length)
        if (!api.schemas[name]) refErrors.push(name)
    }
    for (const value of Object.values(node)) inspect(value)
}
inspect(api)
unique(refErrors, 'unresolved schema reference')
assert.equal(refErrors.length, 0, `Unresolved schemas: ${refErrors.join(', ')}`)
console.log(
    `Documentation verified: ${ids.length} articles, ${operations.length} operations, ${variables.length} variables, ${manifest.controls} controls`
)

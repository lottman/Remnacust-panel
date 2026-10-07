import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../src/', import.meta.url))
const resources = JSON.parse(
    await readFile(new URL('../public/locales/en/remnawave.json', import.meta.url), 'utf8')
)
const missing = []
const dynamic = []
let checked = 0

function hasKey(key) {
    return key.split('.').reduce((value, part) => value?.[part], resources) !== undefined
}

async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
            await visit(path)
            continue
        }
        if (!/\.tsx?$/.test(entry.name)) continue
        const source = await readFile(path, 'utf8')
        const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
        function walk(node) {
            if (
                ts.isJsxAttribute(node) &&
                node.name.text === 'i18nKey' &&
                node.initializer &&
                ts.isStringLiteral(node.initializer)
            ) {
                checked++
                const key = node.initializer.text
                if (!hasKey(key)) {
                    const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1
                    missing.push(`${relative(root, path)}:${line}: ${key}`)
                }
            }
            if (ts.isCallExpression(node) && node.arguments.length > 0) {
                const callee = node.expression
                const name = ts.isIdentifier(callee)
                    ? callee.text
                    : ts.isPropertyAccessExpression(callee) &&
                        callee.name.text === 't' &&
                        ts.isIdentifier(callee.expression) &&
                        ['i18n', 'i18next'].includes(callee.expression.text)
                      ? 't'
                      : undefined
                if (['t', 'translateUiText', 'uiText'].includes(name)) {
                    const argument = node.arguments[0]
                    const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1
                    if (ts.isStringLiteralLike(argument)) {
                        const key = argument.text
                        checked++
                        if (!hasKey(name === 't' ? key : `interface.${key}`)) {
                            missing.push(`${relative(root, path)}:${line}: ${key}`)
                        }
                    } else if (process.argv.includes('--audit')) {
                        dynamic.push(`${relative(root, path)}:${line}: ${argument.getText(file)}`)
                    }
                }
            }
            ts.forEachChild(node, walk)
        }
        walk(file)
    }
}

await visit(root)
console.log(`Checked ${checked} static translation calls.`)
for (const finding of missing) console.error(finding)
if (process.argv.includes('--audit')) {
    console.log(`${dynamic.length} dynamic translation calls:`)
    for (const finding of dynamic) console.log(finding)
}
if (missing.length) process.exitCode = 1

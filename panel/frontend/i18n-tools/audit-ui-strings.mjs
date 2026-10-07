import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../src/', import.meta.url))
const uiProperties = new Set([
    'title',
    'subtitle',
    'message',
    'description',
    'label',
    'placeholder',
    'aria-label',
    'nothingFound'
])
const findings = []

async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
            await visit(path)
            continue
        }
        if (!/\.tsx?$/.test(entry.name)) continue
        // Country names are localized at render time through Intl.DisplayNames.
        if (path.endsWith(join('constants', 'countries.ts'))) continue

        const source = await readFile(path, 'utf8')
        const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)

        function record(node, kind, value) {
            const text = value.trim()
            if (!/[\p{L}]/u.test(text)) return
            const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1
            findings.push({ file: relative(root, path), line, kind, text })
        }

        function walk(node) {
            if (ts.isJsxText(node)) record(node, 'jsx', node.text)
            if (
                ts.isJsxAttribute(node) &&
                uiProperties.has(node.name.text) &&
                node.initializer &&
                ts.isStringLiteral(node.initializer)
            ) {
                record(node, 'attribute', node.initializer.text)
            }
            if (
                ts.isPropertyAssignment(node) &&
                ts.isIdentifier(node.name) &&
                uiProperties.has(node.name.text) &&
                ts.isStringLiteralLike(node.initializer)
            ) {
                record(node, 'property', node.initializer.text)
            }
            ts.forEachChild(node, walk)
        }
        walk(file)
    }
}

await visit(root)
const byFile = Map.groupBy(findings, (finding) => finding.file)
console.log(`${findings.length} direct UI strings in ${byFile.size} files`)
for (const [file, items] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${String(items.length).padStart(3)} ${file}`)
    if (process.argv.includes('--details')) {
        for (const item of items) console.log(`    ${item.line}: ${item.text}`)
    }
}

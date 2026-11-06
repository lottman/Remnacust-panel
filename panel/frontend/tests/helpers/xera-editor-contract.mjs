import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { getLanguageService } from '../../node_modules/monaco-editor/esm/external/vscode-json-languageservice/lib/esm/jsonLanguageService.js'
import { TextDocument } from '../../node_modules/monaco-editor/esm/external/vscode-languageserver-textdocument/lib/esm/main.js'

export function editorService(schemas) {
    const service = getLanguageService({
        schemaRequestService: async (uri) => {
            throw new Error(`Unexpected schema request: ${uri}`)
        }
    })
    service.configure({ validate: true, allowComments: false, schemas })
    return service
}

export function editorDocument(config, uri = 'xray-config://contract') {
    return TextDocument.create(uri, 'json', 1, JSON.stringify(config, null, 2))
}

export async function verifyXeraEditorSchemas(fixtures) {
    let checked = 0
    for (const filename of ['xray.schema.json', 'xray.schema.cn.json']) {
        const schema = JSON.parse(
            readFileSync(new URL(`../../public/assets/${filename}`, import.meta.url), 'utf8')
        )
        const service = editorService([
            { uri: `https://contract/${filename}`, fileMatch: ['xray-config://*'], schema }
        ])
        for (const [kind, cases] of Object.entries(fixtures)) {
            for (const fixture of cases.filter((entry) => entry.editorContract)) {
                const document = editorDocument(fixture.config)
                const diagnostics = await service.doValidation(
                    document,
                    service.parseJSONDocument(document)
                )
                assert.equal(
                    diagnostics.length === 0,
                    kind === 'valid',
                    `${filename}: ${fixture.name}: ${diagnostics.map((item) => item.message).join('; ')}`
                )
                checked++
            }
        }
    }
    return checked
}

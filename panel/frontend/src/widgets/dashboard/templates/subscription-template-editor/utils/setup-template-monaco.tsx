import type { editor, IPosition } from 'monaco-editor'

import { Monaco } from '@monaco-editor/react'
import {
    GetHostsCommand,
    SUBSCRIPTION_TEMPLATE_TYPE,
    TSubscriptionTemplateType
} from '@remnawave/backend-contract'
import consola from 'consola'
import i18next from 'i18next'
import { getLocation } from 'jsonc-parser'
import { configureMonacoYaml, MonacoYaml, MonacoYamlOptions, SchemasSettings } from 'monaco-yaml'
import { app } from 'src/config'

import { loadXrayMode } from '@shared/api/hooks/xray-mode'
import { hostHoverMarkdown } from '@shared/utils/monaco/host-hover'
import { registerJsonSchema } from '@shared/utils/monaco/json-schema-registry'
import { loadEditorSchema } from '@shared/utils/monaco/schema-cache'

import { injectorCompletionValues } from './injector-completions'
import { injectorJsonSchema } from './injector-json-schema'

interface IJsonSchemaDocument {
    [key: string]: unknown
    properties?: Record<string, unknown>
    anyOf?: IJsonSchemaDocument[]
}

export const getTemplateModelPath = (templateType: TSubscriptionTemplateType) =>
    `subscription-template://${templateType.toLowerCase()}`

const YAML_OPTIONS: MonacoYamlOptions = {
    validate: true,
    enableSchemaRequest: true,
    hover: true,
    completion: true,
    format: {
        printWidth: 160,
        enable: true
    }
}

let monacoYaml: MonacoYaml | undefined
let injectorCompletion: { dispose(): void } | undefined

const configureYaml = (monaco: Monaco, schemas?: SchemasSettings[]) => {
    const options: MonacoYamlOptions = { ...YAML_OPTIONS, schemas }

    if (monacoYaml) {
        monacoYaml.update(options)
        return
    }

    monacoYaml = configureMonacoYaml(monaco, options)
}

export const configureMonaco = async (
    monaco: Monaco,
    language: 'json' | 'yaml',
    hosts: GetHostsCommand.Response['response'],
    templateType: TSubscriptionTemplateType
) => {
    try {
        if (templateType === SUBSCRIPTION_TEMPLATE_TYPE.XRAY_JSON) await loadXrayMode()
        if (language === 'yaml') {
            const schemas =
                templateType === SUBSCRIPTION_TEMPLATE_TYPE.MIHOMO
                    ? [
                          {
                              fileMatch: [
                                  getTemplateModelPath(templateType),
                                  `${getTemplateModelPath(templateType)}/*`
                              ],
                              uri: new URL(
                                  app.templateEditor.mihomoYamlSchemaUrl,
                                  window.location.origin
                              ).href
                          }
                      ]
                    : undefined

            configureYaml(monaco, schemas)
        }

        if (language === 'json') {
            let completionHosts = hosts
            let updateSchema: ((schema: IJsonSchemaDocument) => void) | undefined
            injectorCompletion?.dispose()
            injectorCompletion = monaco.languages.registerCompletionItemProvider('json', {
                triggerCharacters: ['"', ':'],
                provideCompletionItems(model: editor.ITextModel, position: IPosition) {
                    if (!model.uri.toString().startsWith('subscription-template://'))
                        return { suggestions: [] }
                    const text = model.getValue()
                    const offset = model.getOffsetAt(position)
                    const previous = getLocation(text, offset).previousNode
                    const replace =
                        previous?.type === 'string' &&
                        previous.offset <= offset &&
                        offset <= previous.offset + previous.length
                    const start = replace ? model.getPositionAt(previous.offset) : position
                    const end = replace
                        ? model.getPositionAt(previous.offset + previous.length)
                        : position
                    return {
                        suggestions: injectorCompletionValues(text, offset, completionHosts).map(
                            ({ value, detail }) => ({
                                label: value,
                                detail: detail === value ? undefined : detail,
                                filterText: `${JSON.stringify(value)} ${detail}`,
                                insertText: JSON.stringify(value),
                                kind: monaco.languages.CompletionItemKind.EnumMember,
                                range: {
                                    startLineNumber: start.lineNumber,
                                    startColumn: start.column,
                                    endLineNumber: end.lineNumber,
                                    endColumn: end.column
                                }
                            })
                        )
                    }
                }
            })
            const updateHosts = (nextHosts: GetHostsCommand.Response['response']) => {
                completionHosts = nextHosts
                const schema = injectorJsonSchema(
                    nextHosts.map((host) => host.uuid),
                    nextHosts.map(hostHoverMarkdown),
                    [...new Set(nextHosts.flatMap((host) => host.tags))]
                )
                registerJsonSchema({
                    fileMatch: ['subscription-template://*', getTemplateModelPath(templateType)],
                    schema,
                    uri: 'https://subscription-template-schema.json'
                })
                updateSchema?.(schema)
            }
            updateHosts(hosts)

            if (templateType === SUBSCRIPTION_TEMPLATE_TYPE.XRAY_JSON) {
                const xraySchema = await loadEditorSchema<IJsonSchemaDocument>(
                    i18next.language === 'zh'
                        ? app.configEditor.jsonSchemaCnUrl
                        : app.configEditor.jsonSchemaUrl
                )
                const definitions = xraySchema.definitions as
                    | Record<string, IJsonSchemaDocument>
                    | undefined
                const strategySettings = definitions?.StrategySettingsObject
                if (strategySettings) {
                    strategySettings.properties = {
                        ...strategySettings.properties,
                        remnacustLoadBalance: { type: 'boolean' },
                        remnacustOrder: { type: 'boolean' }
                    }
                }
                const strategyType = definitions?.StrategyObject?.properties?.type as
                    | IJsonSchemaDocument
                    | undefined
                if (
                    strategyType?.anyOf &&
                    !strategyType.anyOf.some((option) => option.const === 'priority')
                ) {
                    strategyType.anyOf = [...strategyType.anyOf, { const: 'priority' }]
                }
                const root =
                    typeof xraySchema.$ref === 'string'
                        ? definitions?.[xraySchema.$ref.replace('#/definitions/', '')]
                        : xraySchema

                if (!root) throw new Error('Xray schema root is unavailable')
                updateSchema = (schema) => {
                    root.properties = { ...root.properties, ...schema.properties }
                    registerJsonSchema({
                        fileMatch: [
                            getTemplateModelPath(templateType),
                            `${getTemplateModelPath(templateType)}/*`
                        ],
                        schema: xraySchema,
                        uri: 'https://subscription-template-xray-schema.json'
                    })
                }
            }

            if (templateType === SUBSCRIPTION_TEMPLATE_TYPE.SINGBOX) {
                const singboxSchema = await loadEditorSchema<IJsonSchemaDocument>(
                    app.templateEditor.singboxJsonSchemaUrl
                )

                updateSchema = (schema) => {
                    registerJsonSchema({
                        fileMatch: [
                            getTemplateModelPath(templateType),
                            `${getTemplateModelPath(templateType)}/*`
                        ],
                        schema: {
                            ...singboxSchema,
                            properties: { ...singboxSchema.properties, ...schema.properties }
                        },
                        uri: 'https://singbox-schema.json'
                    })
                }
            }
            updateHosts(completionHosts)
            return updateHosts
        }
    } catch (error) {
        consola.error(`Failed to configure Monaco ${language.toUpperCase()}:`, error)
    }
}

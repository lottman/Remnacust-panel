import { Monaco } from '@monaco-editor/react'
import {
    GetHostsCommand,
    SUBSCRIPTION_TEMPLATE_TYPE,
    TSubscriptionTemplateType
} from '@remnawave/backend-contract'
import axios from 'axios'
import consola from 'consola'
import { configureMonacoYaml, MonacoYaml, MonacoYamlOptions, SchemasSettings } from 'monaco-yaml'
import { app } from 'src/config'

import { translateUiText as uiText } from '@shared/i18n/interface-text'
import { injectorJsonSchema } from './injector-json-schema'
import { registerJsonSchema } from '@shared/utils/monaco/json-schema-registry'

type Host = GetHostsCommand.Response['response'][number]

interface IJsonSchemaDocument {
    [key: string]: unknown
    properties?: Record<string, unknown>
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

const configureYaml = (monaco: Monaco, schemas?: SchemasSettings[]) => {
    const options: MonacoYamlOptions = { ...YAML_OPTIONS, schemas }

    if (monacoYaml) {
        monacoYaml.update(options)
        return
    }

    monacoYaml = configureMonacoYaml(monaco, options)
}


function getHostStatus(host: Host): { icon: string; label: string } {
    if (host.isDisabled)
        return {
            icon: '⛔',
            get label() {
                return uiText('disabled-75081b5')
            }
        }
    if (host.isHidden)
        return {
            icon: '👁',
            get label() {
                return uiText('hidden-7e6feff')
            }
        }
    return {
        icon: '✅',
        get label() {
            return uiText('active-9234069')
        }
    }
}

function buildMarkdownDescription(host: Host): string {
    const { icon, label } = getHostStatus(host)

    const rows: string[] = [
        '',
        '| | |',
        '|:--|:--|',
        `| **Remark** | **${host.remark}** |`,
        `| **Address** | \`${host.address}:${host.port}\` |`,
        `| **Status** | ${icon} ${label} |`
    ]

    if (host.tags.length > 0) rows.push(`| **Tags** | \`${host.tags.join(', ')}\` |`)
    if (host.sni) rows.push(`| **SNI** | \`${host.sni}\` |`)
    if (host.serverDescription) rows.push(`| **Description** | ${host.serverDescription} |`)
    if (host.inbound.configProfileUuid) {
        rows.push(`| **Profile UUID** | \`${host.inbound.configProfileUuid}\` |`)
    }
    if (host.inbound.configProfileInboundUuid) {
        rows.push(`| **Inbound UUID** | \`${host.inbound.configProfileInboundUuid}\` |`)
    }

    return rows.join('\n')
}

export const configureMonaco = async (
    monaco: Monaco,
    language: 'json' | 'yaml',
    hosts: GetHostsCommand.Response['response'],
    templateType: TSubscriptionTemplateType
) => {
    try {
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
            const hostUuids = hosts.map((h) => h.uuid)
            const hostDescriptions = hosts.map(buildMarkdownDescription)

            const schema = injectorJsonSchema(hostUuids, hostDescriptions, [
                ...new Set(hosts.flatMap((host) => host.tags))
            ])

            registerJsonSchema({
                fileMatch: ['subscription-template://*', getTemplateModelPath(templateType)],
                schema,
                uri: 'https://subscription-template-schema.json'
            })

            if (templateType === SUBSCRIPTION_TEMPLATE_TYPE.SINGBOX) {
                const response = await axios.get<IJsonSchemaDocument>(
                    app.templateEditor.singboxJsonSchemaUrl
                )
                const singboxSchema = response.data

                registerJsonSchema({
                    fileMatch: [
                        getTemplateModelPath(templateType),
                        `${getTemplateModelPath(templateType)}/*`
                    ],
                    schema: {
                        ...singboxSchema,
                        properties: { ...singboxSchema.properties, remnawave: true }
                    },
                    uri: 'https://singbox-schema.json'
                })
            }
        }
    } catch (error) {
        consola.error(`Failed to configure Monaco ${language.toUpperCase()}:`, error)
    }
}

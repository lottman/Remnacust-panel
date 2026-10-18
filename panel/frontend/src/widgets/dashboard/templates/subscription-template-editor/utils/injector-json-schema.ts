// JSON Schema conditionals use the literal then keyword; these are not Promise methods.
/* oxlint-disable unicorn/no-thenable */
export function injectorJsonSchema(hostUuids: string[], descriptions: string[], tags: string[]) {
    const host = {
        type: 'string',
        format: 'uuid'
    }
    const tag = { type: 'string', minLength: 1, maxLength: 255 }
    const groups = (item: object) => ({
        anyOf: [
            {
                type: 'array',
                minItems: 1,
                maxItems: 1000,
                items: { type: 'array', minItems: 1, maxItems: 10000, items: item }
            },
            {
                type: 'object',
                minProperties: 1,
                maxProperties: 1000,
                additionalProperties: { type: 'array', minItems: 1, maxItems: 10000, items: item }
            }
        ]
    })
    const pool = (type: string, item: object) => ({
        type: 'object',
        properties: {
            type: { const: type },
            values: { type: 'array', minItems: 1, maxItems: 10000, items: item },
            groups: groups(item),
            expected: { type: 'integer', minimum: 1, maximum: 1000 }
        },
        required: ['type'],
        additionalProperties: false
    })
    return {
        type: 'object',
        properties: {
            remnawave: {
                type: 'object',
                properties: {
                    assignTo: {
                        type: 'object',
                        properties: {
                            hosts: {
                                type: 'array',
                                maxItems: 10000,
                                items: {
                                    ...host,
                                    examples: hostUuids,
                                    markdownEnumDescriptions: descriptions
                                }
                            },
                            tags: {
                                type: 'array',
                                maxItems: 10000,
                                items: { ...tag, examples: tags }
                            }
                        },
                        additionalProperties: false
                    },
                    addVirtualHostAsOutbound: { type: 'boolean' },
                    injectHosts: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                mode: { enum: ['all', 'random', 'group'], default: 'all' },
                                selectFrom: {
                                    enum: ['ALL', 'HIDDEN', 'NOT_HIDDEN'],
                                    default: 'HIDDEN'
                                },
                                tagPrefix: { type: 'string', minLength: 1 },
                                useHostRemarkAsTag: { type: 'boolean' },
                                useHostTagAsTag: { type: 'boolean' },
                                selector: {
                                    oneOf: [
                                        pool('uuids', host),
                                        pool('tags', tag),
                                        ...['remarkRegex', 'tagRegex'].map((type) => ({
                                            type: 'object',
                                            properties: {
                                                type: { const: type },
                                                pattern: { type: 'string', minLength: 1 },
                                                expected: {
                                                    type: 'integer',
                                                    minimum: 1,
                                                    maximum: 1000
                                                },
                                                groups: groups(host)
                                            },
                                            required: ['type', 'pattern'],
                                            additionalProperties: false
                                        })),
                                        {
                                            type: 'object',
                                            properties: {
                                                type: { const: 'sameTagAsRecipient' },
                                                expected: {
                                                    type: 'integer',
                                                    minimum: 1,
                                                    maximum: 1000
                                                },
                                                groups: groups(host)
                                            },
                                            required: ['type'],
                                            additionalProperties: false
                                        }
                                    ]
                                }
                            },
                            required: ['selector'],
                            additionalProperties: false,
                            allOf: [
                                {
                                    if: {
                                        properties: { mode: { const: 'group' } },
                                        required: ['mode']
                                    },
                                    then: {
                                        properties: {
                                            selector: {
                                                required: ['groups']
                                            }
                                        }
                                    },
                                    else: {
                                        if: {
                                            properties: {
                                                selector: {
                                                    properties: {
                                                        type: { enum: ['uuids', 'tags'] }
                                                    },
                                                    required: ['type']
                                                }
                                            }
                                        },
                                        then: { properties: { selector: { required: ['values'] } } }
                                    }
                                },
                                {
                                    if: {
                                        properties: { mode: { const: 'random' } },
                                        required: ['mode']
                                    },
                                    then: {
                                        properties: {
                                            selector: {
                                                required: ['expected']
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    }
                },
                additionalProperties: false
            }
        }
    }
}

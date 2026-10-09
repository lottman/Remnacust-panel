import type { Schema } from './documentation.types'

import { Badge, Box, Code, Group, Text } from '@mantine/core'
import { useState } from 'react'

import { useDocumentationTranslation } from './documentation-shell'
import classes from './documentation.module.css'
import { resolveSchema } from './reference-utils'

interface Props {
    schema: Schema
    schemas: Record<string, Schema>
    name?: string
    required?: boolean
    depth?: number
    ancestors?: string[]
}
export function SchemaTree({
    schema,
    schemas,
    name = '$',
    required = false,
    depth = 0,
    ancestors = []
}: Props) {
    const { t } = useDocumentationTranslation()
    const [open, setOpen] = useState(depth < 2)
    const ref = schema.$ref?.split('/').pop()
    const recursive = ref && ancestors.includes(ref)
    const resolved = recursive ? schema : resolveSchema(schema, schemas)
    const nextAncestors = ref ? [...ancestors, ref] : ancestors
    const properties = Object.entries(resolved.properties ?? {})
    const branches = resolved.oneOf ?? resolved.anyOf ?? resolved.allOf ?? []
    const nested =
        properties.length > 0 ||
        !!resolved.items ||
        branches.length > 0 ||
        typeof resolved.additionalProperties === 'object'
    const constraints = Object.entries(resolved).filter(
        ([key]) =>
            [
                'minimum',
                'maximum',
                'exclusiveMinimum',
                'exclusiveMaximum',
                'minLength',
                'maxLength',
                'minItems',
                'maxItems',
                'pattern',
                'uniqueItems',
                'additionalProperties'
            ].includes(key) && typeof resolved[key] !== 'object'
    )
    return (
        <Box className={classes.schemaNode} data-doc-schema>
            <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
                <summary className={classes.schemaSummary}>
                    <Code>{name}</Code>
                    <Text component="span" size="xs" c="dimmed">
                        {Array.isArray(resolved.type)
                            ? resolved.type.join(' | ')
                            : (resolved.type ??
                              (resolved.properties ? 'object' : (ref ?? 'schema')))}
                        {resolved.format ? ` · ${resolved.format}` : ''}
                        {resolved.nullable ? ' | null' : ''}
                    </Text>
                    {required && (
                        <Badge size="xs" variant="light">
                            {t('documentation.required')}
                        </Badge>
                    )}
                </summary>
                {open && (
                    <Box className={classes.schemaBody}>
                        {resolved.description && (
                            <Text size="sm" mb={8}>
                                {resolved.description}
                            </Text>
                        )}
                        {ref && (
                            <Text size="xs" c="dimmed">
                                {t('documentation.unresolved')}: <Code>{ref}</Code>
                            </Text>
                        )}
                        {resolved.enum && (
                            <Text size="xs" mb={8}>
                                {t('documentation.enum')}:{' '}
                                <Code>{JSON.stringify(resolved.enum)}</Code>
                            </Text>
                        )}
                        {resolved.const !== undefined && (
                            <Code>{JSON.stringify(resolved.const)}</Code>
                        )}
                        {resolved.default !== undefined && (
                            <Text size="xs" mb={8}>
                                {t('documentation.default')}:{' '}
                                <Code>{JSON.stringify(resolved.default)}</Code>
                            </Text>
                        )}
                        {constraints.length > 0 && (
                            <Group gap={6} mb={8}>
                                {constraints.map(([key, value]) => (
                                    <Code key={key}>
                                        {key}: {String(value)}
                                    </Code>
                                ))}
                            </Group>
                        )}
                        {!recursive && nested && depth < 14 && (
                            <Box className={classes.schemaChildren}>
                                {properties.map(([key, value]) => (
                                    <SchemaTree
                                        key={key}
                                        name={key}
                                        required={resolved.required?.includes(key)}
                                        schema={value}
                                        schemas={schemas}
                                        depth={depth + 1}
                                        ancestors={nextAncestors}
                                    />
                                ))}
                                {resolved.items && (
                                    <SchemaTree
                                        name="[]"
                                        schema={resolved.items}
                                        schemas={schemas}
                                        depth={depth + 1}
                                        ancestors={nextAncestors}
                                    />
                                )}
                                {branches.map((branch, index) => (
                                    <SchemaTree
                                        key={index}
                                        name={`${resolved.oneOf ? 'oneOf' : resolved.anyOf ? 'anyOf' : 'allOf'} ${index + 1}`}
                                        schema={branch}
                                        schemas={schemas}
                                        depth={depth + 1}
                                        ancestors={nextAncestors}
                                    />
                                ))}
                                {typeof resolved.additionalProperties === 'object' && (
                                    <SchemaTree
                                        name="[key]"
                                        schema={resolved.additionalProperties}
                                        schemas={schemas}
                                        depth={depth + 1}
                                        ancestors={nextAncestors}
                                    />
                                )}
                            </Box>
                        )}
                    </Box>
                )}
            </details>
        </Box>
    )
}

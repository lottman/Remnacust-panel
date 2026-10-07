import type { ApiOperation, Schema } from './documentation.types'

export function normalizeSearch(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase().replace(/ё/g, 'е').trim()
}
export function matchesSearch(text: string, query: string): boolean {
    const haystack = normalizeSearch(text)
    return normalizeSearch(query)
        .split(/\s+/)
        .every((word) => haystack.includes(word))
}
export function resolveSchema(
    schema: Schema,
    schemas: Record<string, Schema>,
    seen = new Set<string>()
): Schema {
    if (!schema.$ref) return schema
    const name = schema.$ref.split('/').pop() ?? ''
    if (seen.has(name) || !schemas[name]) return schema
    return {
        ...resolveSchema(schemas[name], schemas, new Set([...seen, name])),
        ...Object.fromEntries(Object.entries(schema).filter(([key]) => key !== '$ref'))
    }
}
export function schemaExample(schema: Schema, schemas: Record<string, Schema>, depth = 0): unknown {
    if (depth > 6) return '<value>'
    const resolved = resolveSchema(schema, schemas)
    if (resolved.example !== undefined) return resolved.example
    if (resolved.default !== undefined) return resolved.default
    if (resolved.const !== undefined) return resolved.const
    if (resolved.enum?.length) return resolved.enum[0]
    const branch = resolved.oneOf?.[0] ?? resolved.anyOf?.find((item) => item.type !== 'null')
    if (branch) return schemaExample(branch, schemas, depth + 1)
    if (resolved.allOf)
        return Object.assign(
            {},
            ...resolved.allOf.map((item) => schemaExample(item, schemas, depth + 1))
        )
    if (resolved.properties)
        return Object.fromEntries(
            Object.entries(resolved.properties)
                .filter(([name]) => resolved.required?.includes(name))
                .map(([name, value]) => [name, schemaExample(value, schemas, depth + 1)])
        )
    const type = Array.isArray(resolved.type)
        ? resolved.type.find((item) => item !== 'null')
        : resolved.type
    if (type === 'array') return [schemaExample(resolved.items ?? {}, schemas, depth + 1)]
    if (type === 'boolean') return true
    if (type === 'number' || type === 'integer') return Math.max(1, Number(resolved.minimum ?? 1))
    if (resolved.format === 'uuid') return '11111111-1111-4111-8111-111111111111'
    if (resolved.format?.includes('date')) return '2026-12-01T00:00:00.000Z'
    if (resolved.format === 'email') return 'user@example.test'
    return '<value>'
}
export function curlExample(operation: ApiOperation, schemas: Record<string, Schema>): string {
    let url = `https://panel.example.com${operation.path.replace(/\{([^}]+)\}/g, (_, name) => `<${name}>`)}`
    const query = (operation.parameters ?? []).filter(
        (item) => item.in === 'query' && item.required
    )
    if (query.length)
        url +=
            '?' +
            query
                .map((item) => {
                    const value = schemaExample(item.schema ?? {}, schemas)
                    return `${encodeURIComponent(item.name)}=${encodeURIComponent(typeof value === 'object' ? JSON.stringify(value) : String(value))}`
                })
                .join('&')
    const lines = [`curl --request ${operation.method} '${url}'`]
    if (operation['x-remnacust-access'] === 'api-token')
        lines.push("  --header 'Authorization: Bearer <API_TOKEN>'")
    else if (operation['x-remnacust-access'] === 'admin')
        lines.push("  --header 'Authorization: Bearer <ADMIN_SESSION>'")
    else if (operation['x-remnacust-access'] === 'special') {
        if (operation.security?.some((item) => 'Prometheus' in item))
            lines.push("  --user '<METRICS_USER>:<METRICS_PASS>'")
    }
    lines.push("  --header 'Accept: application/json'")
    const json = operation.requestBody?.content?.['application/json']
    if (json?.schema) {
        let example = schemaExample(json.schema, schemas)
        if (operation.path.startsWith('/api/limits/') && operation.method === 'POST')
            example = {
                kind: 'TAG',
                key: 'DE',
                selection: { type: 'SELECTED', userIds: ['42'] },
                ...(operation.path.endsWith('/actions')
                    ? {
                          action: 'ADD',
                          amountBytes: 1073741824,
                          requestId: '11111111-1111-4111-8111-111111111111'
                      }
                    : operation.path.endsWith('/unlimited')
                      ? { enabled: true, requestId: '11111111-1111-4111-8111-111111111111' }
                      : {})
            }
        lines.push(
            "  --header 'Content-Type: application/json'",
            `  --data '${JSON.stringify(example, null, 2).replaceAll("'", "'\\''")}'`
        )
    }
    // A comment must not be inserted into a backslash-continued command.
    return lines.filter((line) => !line.trimStart().startsWith('#')).join(' \\\n')
}

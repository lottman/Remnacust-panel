export type DocLanguage = 'en' | 'ru' | 'fa' | 'zh'
export interface DocVariable {
    name: string
    args: string[]
    description: Record<DocLanguage, string>
}

export interface DocSection {
    id: string
    title: string
    body: string
}
export interface DocArticle {
    id: string
    title: string
    sections: DocSection[]
}
export interface RegistryArticle {
    id: string
    category: string
    ru: string
    en: string
    fa: string
    zh: string
    route?: string
    sources: string[]
    resources: string[]
    sectionIds: string[]
}
export interface Registry {
    categories: { id: string; ru: string; en: string; fa: string; zh: string }[]
    articles: RegistryArticle[]
}
export interface Control {
    explanation?: Record<DocLanguage, string>
    field?: string
    labelKey?: string
    descriptionKey?: string
    label?: string
    control: string
    min?: string
    max?: string
    source: string
}
export interface Schema {
    $ref?: string
    type?: string | string[]
    title?: string
    description?: string
    format?: string
    properties?: Record<string, Schema>
    required?: string[]
    items?: Schema
    additionalProperties?: Schema | boolean
    oneOf?: Schema[]
    anyOf?: Schema[]
    allOf?: Schema[]
    enum?: unknown[]
    const?: unknown
    default?: unknown
    example?: unknown
    examples?: unknown[]
    nullable?: boolean
    [key: string]: unknown
}
export interface Payload {
    description?: string
    content?: Record<string, { schema?: Schema; examples?: Record<string, { value?: unknown }> }>
}
export interface ApiOperation {
    id: string
    path: string
    method: string
    summary?: string
    description?: string
    tags?: string[]
    'x-remnacust-access': 'api-token' | 'admin' | 'public' | 'special'
    'x-remnacust-scope'?: string
    'x-remnacust-resource'?: string
    'x-remnacust-kind'?: string
    parameters?: {
        name: string
        in: string
        required?: boolean
        description?: string
        schema?: Schema
    }[]
    requestBody?: Payload
    responses?: Record<string, Payload>
    security?: Record<string, string[]>[]
}
export interface ApiReference {
    version: string
    endpoints: ApiOperation[]
    schemas: Record<string, Schema>
    securitySchemes: Record<string, Schema>
}
export interface DocManifest {
    generatedAt: string
    backendVersion: string
    coreVersion: string
    nodeVersion: string
    upstreamPanelVersion: string
    upstreamBackendPatches?: {
        commit: string
        date: string
        description: Record<DocLanguage, string>
    }[]
    upstreamNodeVersion: string
    upstreamCoreVersion: string
    upstreamCoreCommit: string
    articles: number
    endpoints: number
    apiTokenEndpoints: number
    controls: number
    sourceFiles: number
}

import type { ClientFormat } from './client-template-model'
import type { GeofileRefresh } from './geofile-refresh-settings'

export interface GeofileSelection {
    format: ClientFormat
    categories: string[]
}

export interface Geofile {
    id: string
    name: string
    kind: string
    size: number
    sha256: string
    filename: string
    url: string
    categories?: string[]
    refresh?: GeofileRefresh
    origin?: 'preset' | 'upload' | 'import' | 'copy'
    editPolicy?: 'copy' | 'edit'
}

export type GeofileRecordType = 'domain' | 'full' | 'keyword' | 'regexp' | 'ip'
export interface GeofileRecord {
    index: number
    type: GeofileRecordType
    value: string
    attributeCount?: number
}
export interface GeofileContent {
    file: Geofile
    mode: 'dat' | 'text' | 'binary'
    category?: string
    records: GeofileRecord[]
    total?: number
    page?: number
    limit?: number
    text?: string
    maxTextBytes?: number
}

import { editClientTemplate, readClientTemplate, type ClientFormat } from './client-template-model'
import { geofilePresets } from './geofile-presets'

export interface LibraryGeofile {
    id: string
    name: string
    kind: string
    size: number
    refresh?: { sourceUrl: string }
}

export function compatibleGeofile(kind: string, format: ClientFormat): boolean {
    return (
        ['geoip', 'geosite'].includes(kind) ||
        (format === 'SINGBOX'
            ? kind.startsWith('singbox-')
            : format !== 'XRAY_JSON' &&
              kind.startsWith('mihomo-') &&
              (format === 'MIHOMO' || !kind.startsWith('mihomo-text-')))
    )
}

// Uploads finish asynchronously: attach to the current draft, not the draft
// captured before the request, and preserve unrelated edits and references.
export function attachLibraryGeofile(
    text: string,
    format: ClientFormat,
    file: LibraryGeofile
): string {
    if (!compatibleGeofile(file.kind, format)) throw new Error('incompatible-geofile')
    const current = readClientTemplate(text, format)
    const refs = current.remnacust?.geofiles ?? []
    if (refs.some((ref: { id: string }) => ref.id === file.id)) return text
    return editClientTemplate(
        text,
        format,
        ['remnacust', 'geofiles'],
        [
            ...refs,
            {
                id: file.id,
                ...(['geoip', 'geosite'].includes(file.kind) ? { categories: [] } : {}),
                target: 'DIRECT',
                downloadToClient: file.kind === 'singbox-srs',
                clientRefreshIntervalSeconds: 86400
            }
        ]
    )
}

// The catalog is global; format compatibility controls attachment, never visibility.
export function geofileCatalog(files: LibraryGeofile[]) {
    const sources = new Set(files.map((file) => file.refresh?.sourceUrl).filter(Boolean))
    return [
        ...(files.length
            ? [
                  {
                      group: 'uploaded',
                      items: files.map((file) => ({
                          value: `file:${file.id}`,
                          label: `${file.name} · ${file.kind} · ${(file.size / 1048576).toFixed(1)} MiB`
                      }))
                  }
              ]
            : []),
        ...['V2Fly', 'MetaCubeX']
            .map((provider) => ({
                group: provider,
                items: geofilePresets
                    .filter((preset) => preset.provider === provider && !sources.has(preset.url))
                    .map((preset) => ({ value: `preset:${preset.id}`, label: preset.name }))
            }))
            .filter((group) => group.items.length)
    ]
}

import { editClientTemplate, readClientTemplate, type ClientFormat } from './client-template-model'
import { geofilePresets } from './geofile-presets'

export interface LibraryGeofile {
    id: string
    name: string
    kind: string
    size: number
    categories?: string[]
    refresh?: { sourceUrl?: string }
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

export function replaceLibraryGeofile(
    text: string,
    format: ClientFormat,
    sourceId: string,
    file: LibraryGeofile,
    validatedSelections?: string[][]
): string {
    if (!compatibleGeofile(file.kind, format)) throw new Error('incompatible-geofile')
    const current = readClientTemplate(text, format)
    const refs = current.remnacust?.geofiles ?? []
    if (!refs.some((ref: { id: string }) => ref.id === sourceId)) return text
    if (
        !validatedSelections &&
        refs.some(
            (ref: { id: string; categories?: string[] }) =>
                ref.id === sourceId && ref.categories?.some((category) => category.includes('@'))
        )
    )
        throw new Error('geofile-copy-selection')
    const selectionKey = (categories: string[]) =>
        JSON.stringify([...new Set(categories.map((category) => category.toLowerCase()))].sort())
    if (
        validatedSelections &&
        refs.some(
            (ref: { id: string; categories?: string[] }) =>
                ref.id === sourceId &&
                !validatedSelections.some(
                    (selection) => selectionKey(selection) === selectionKey(ref.categories ?? [])
                )
        )
    )
        throw new Error('geofile-copy-selection')
    if (['geoip', 'geosite'].includes(file.kind)) {
        const available = new Set((file.categories ?? []).map((category) => category.toLowerCase()))
        if (
            refs.some(
                (ref: { id: string; categories?: string[] }) =>
                    ref.id === sourceId &&
                    ref.categories?.some(
                        (category) => !available.has(category.toLowerCase().split('@')[0])
                    )
            )
        )
            throw new Error('geofile-copy-selection')
    }
    return editClientTemplate(
        text,
        format,
        ['remnacust', 'geofiles'],
        refs.map((ref: { id: string }) => (ref.id === sourceId ? { ...ref, id: file.id } : ref))
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
        ...[...new Set(geofilePresets.map((preset) => preset.provider))]
            .map((provider) => ({
                group: provider,
                items: geofilePresets
                    .filter((preset) => preset.provider === provider && !sources.has(preset.url))
                    .map((preset) => ({ value: `preset:${preset.id}`, label: preset.name }))
            }))
            .filter((group) => group.items.length)
    ]
}

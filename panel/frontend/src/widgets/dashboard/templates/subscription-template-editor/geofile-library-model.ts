import type { ClientFormat } from './client-template-model'

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

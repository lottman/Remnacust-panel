import type { GeofileRecord } from './geofile-types'

import { parseAddressRules } from './geofile-address-rules'

export type GeofileRecordChange = Pick<GeofileRecord, 'index' | 'type' | 'value'> & {
    remove?: boolean
}

export function geofileRecordPatch(
    changes: Record<number, GeofileRecordChange>,
    text: string,
    kind: string
) {
    const additions = text.trim() ? parseAddressRules(text) : []
    const records = Object.values(changes).map((record) =>
        record.remove
            ? { index: record.index, remove: true as const }
            : { index: record.index, type: record.type, value: record.value }
    )
    if (
        records.length + additions.length > 1000 ||
        additions.some((record) => (kind === 'geoip' ? record.type !== 'ip' : record.type === 'ip'))
    )
        throw Error('geofile-edit-batch')
    return { changes: records, additions }
}

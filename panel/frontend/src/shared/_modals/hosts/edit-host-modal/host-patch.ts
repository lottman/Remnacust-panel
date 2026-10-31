import type { UpdateHostCommand } from '@remnawave/backend-contract'

import { parseJsonField } from '@shared/utils/misc/parse-json-field'

const jsonFields = new Set(['xhttpExtraParams', 'muxParams', 'sockoptParams', 'finalMask'])

export function hostPatch(
    values: UpdateHostCommand.RequestBody,
    isDirty: (field: string) => boolean,
    uuid: string
): UpdateHostCommand.RequestBody {
    return {
        ...Object.fromEntries(
            Object.entries(values)
                .filter(([key]) => key !== 'uuid' && isDirty(key))
                .map(([key, value]) => [key, jsonFields.has(key) ? parseJsonField(value) : value])
        ),
        uuid
    }
}

import {
    CustomRemarksSchema,
    DEFAULT_SUBSCRIPTION_REMARKS,
    type TCustomRemarks
} from '@remnawave/backend-contract'

export type CustomRemarks = TCustomRemarks
export type ActiveExpiryRule = NonNullable<CustomRemarks['activeExpiry']>['rules'][number]

export const remarkFields = [
    'expiredUsers',
    'limitedUsers',
    'disabledUsers',
    'frozenUsers',
    'emptyHosts',
    'HWIDMaxDevicesExceeded',
    'HWIDNotSupported',
    'HWIDRegistrationBlocked',
    'HWIDBlocked',
    'hostTrafficPaused',
    'hostTrafficLimit'
] as const

export const defaultRemarks = (): CustomRemarks =>
    CustomRemarksSchema.parse(structuredClone(DEFAULT_SUBSCRIPTION_REMARKS))

export function comparable(value: unknown): string {
    if (Array.isArray(value)) return '[' + value.map(comparable).join(',') + ']'
    if (value && typeof value === 'object')
        return (
            '{' +
            Object.entries(value)
                .filter(([, item]) => item !== undefined)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, item]) => JSON.stringify(key) + ':' + comparable(item))
                .join(',') +
            '}'
        )
    return JSON.stringify(value) ?? 'undefined'
}

export interface RemarksDraft {
    baseline: CustomRemarks | null
    remote: CustomRemarks | null
    draft: CustomRemarks
    override: boolean
}

export const draftValue = (state: RemarksDraft) => (state.override ? state.draft : null)
export const isRemarksDirty = (state: RemarksDraft) =>
    comparable(draftValue(state)) !== comparable(state.baseline)
export const hasRemoteRemarks = (state: RemarksDraft) =>
    comparable(state.remote) !== comparable(state.baseline)

export function createRemarksDraft(
    value: CustomRemarks | null,
    inherited?: CustomRemarks
): RemarksDraft {
    return {
        baseline: structuredClone(value),
        remote: structuredClone(value),
        draft: structuredClone(value ?? inherited ?? defaultRemarks()),
        override: value !== null
    }
}

export type RemarksDraftAction =
    | { type: 'edit'; value: CustomRemarks }
    | { type: 'override'; enabled: boolean }
    | { type: 'sync'; value: CustomRemarks | null; inherited?: CustomRemarks }
    | { type: 'reset'; inherited?: CustomRemarks }
    | {
          type: 'saved'
          value: CustomRemarks | null
          submitted: CustomRemarks | null
          inherited?: CustomRemarks
      }

export function remarksDraftReducer(state: RemarksDraft, action: RemarksDraftAction): RemarksDraft {
    switch (action.type) {
        case 'edit':
            return { ...state, draft: action.value }
        case 'override':
            return { ...state, override: action.enabled }
        case 'reset':
            return createRemarksDraft(state.remote, action.inherited)
        case 'sync':
            if (isRemarksDirty(state)) return { ...state, remote: structuredClone(action.value) }
            return createRemarksDraft(action.value, action.inherited)
        case 'saved':
            if (comparable(draftValue(state)) !== comparable(action.submitted))
                return {
                    ...state,
                    baseline: structuredClone(action.value),
                    remote: structuredClone(action.value)
                }
            return createRemarksDraft(action.value, action.inherited ?? state.draft)
    }
}

export function prepareRemarks(value: CustomRemarks): CustomRemarks {
    const next = structuredClone(value)
    for (const field of remarkFields)
        next[field] = (next[field] ?? []).filter((line) => line.trim())
    if (next.activeExpiry)
        next.activeExpiry.rules = next.activeExpiry.rules.map((rule) => ({
            ...rule,
            remarks: rule.remarks.filter((line) => line.trim())
        }))
    return next
}

export function newExpiryRule(id: string, note: string): ActiveExpiryRule {
    return {
        id,
        enabled: true,
        daysBeforeExpiry: 7,
        scope: 'all',
        internalSquadUuids: [],
        externalSquadUuids: [],
        remarks: [note, '{HOSTS}']
    }
}

export function squadOptions(
    squads: Array<{ uuid: string; name: string }>,
    selected: string[],
    missingLabel: (id: string) => string
) {
    const result = squads.map((squad) => ({ value: squad.uuid, label: squad.name }))
    const available = new Set(result.map((option) => option.value))
    for (const id of selected)
        if (!available.has(id)) result.push({ value: id, label: missingLabel(id) })
    return result
}

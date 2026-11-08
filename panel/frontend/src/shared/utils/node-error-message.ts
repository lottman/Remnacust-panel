import type { TFunction } from 'i18next'

const stages = {
    profile: 'nodeErrors.profile',
    snippets: 'nodeErrors.snippets',
    validation: 'nodeErrors.validation',
    certificates: 'nodeErrors.certificates',
    users: 'nodeErrors.users',
    devices: 'nodeErrors.devices',
    identities: 'nodeErrors.identities'
} as const

export function hasNodeErrorMessage(message: string | null | undefined): message is string {
    return typeof message === 'string' &&
        !/^(?:\s*|\{\s*\}|\[\s*\]|null|undefined|"")$/.test(message.trim())
}

export function nodeConfigurationNeedsRestart(message: string): boolean {
    return message.includes('Global core settings changed; preserve current sessions and apply this change during an explicit maintenance restart')
}

/** Translate known diagnostics; keep unknown messages available for investigation. */
export function getNodeErrorMessage(message: string, t: TFunction): string {
    if (nodeConfigurationNeedsRestart(message)) return t('nodeErrors.maintenanceRestart' as never)
    if (message === 'canceled' || message === '"canceled"' || message === 'Node API request timed out')
        return t('nodeErrors.requestTimeout' as never)
    if (message === 'Failed to get system stats') return t('nodeErrors.telemetryUnavailable' as never)
    if (message === '[NODE_NATIVE_COMPATIBILITY]') return t('nodeErrors.nativeCompatibility')
    if (message === '[NODE_LEGACY_AUTOSELECT]') return t('nodeErrors.legacyAutoselect')
    const preparation = /^Node configuration preparation failed \[([a-z]+)\]$/.exec(message)
    if (preparation && Object.hasOwn(stages, preparation[1])) {
        return t(stages[preparation[1] as keyof typeof stages])
    }
    if (message === 'Failed to get config for node' || message === 'Failed to get config') {
        return t('nodeErrors.preparation')
    }
    return message
}

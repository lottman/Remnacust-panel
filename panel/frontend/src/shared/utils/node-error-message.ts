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

/** Translate known diagnostics; keep unknown messages available for investigation. */
export function getNodeErrorMessage(message: string, t: TFunction): string {
    const preparation = /^Node configuration preparation failed \[([a-z]+)\]$/.exec(message)
    if (preparation && Object.hasOwn(stages, preparation[1])) {
        return t(stages[preparation[1] as keyof typeof stages])
    }
    if (message === 'Failed to get config for node' || message === 'Failed to get config') {
        return t('nodeErrors.preparation')
    }
    const listener = /Inbound ([^\r\n]{1,128}) changes its port or transport;/.exec(message)
    if (listener) return t('nodeErrors.listener-change', { tag: listener[1] })
    return message
}

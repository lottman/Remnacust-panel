import i18next from 'i18next'

const entities = {
    'Api token': 'api-token',
    Passkey: 'passkey',
    Config: 'config',
    'External Squad': 'external-squad',
    Host: 'host',
    Hosts: 'hosts',
    'Infra Provider': 'infra-provider',
    'Infra Billing History Record': 'billing-history',
    'Infra Billing Node': 'billing-node',
    'Internal Squad': 'internal-squad',
    'Node integration': 'node-integration',
    'Node plugin': 'node-plugin',
    'Shared list': 'shared-list',
    Node: 'node',
    'Node traffic': 'node-traffic',
    Nodes: 'nodes',
    'Remnawave settings': 'settings',
    Snippet: 'snippet',
    'Subscription page config': 'subscription-page-config',
    'Subscription settings': 'subscription-settings',
    'Subscription template': 'subscription-template',
    User: 'user',
    'User subscription': 'user-subscription',
    'User traffic': 'user-traffic'
} as const

type Entity = keyof typeof entities
type EntityKey = `mutation-entities.${(typeof entities)[Entity]}`
const entityName = (name: Entity) =>
    i18next.t(`mutation-entities.${entities[name]}` as EntityKey)

const verbs = {
    created: (entity: string) => i18next.t('mutation-messages.created', { entity }),
    updated: (entity: string) => i18next.t('mutation-messages.updated', { entity }),
    deleted: (entity: string) => i18next.t('mutation-messages.deleted', { entity }),
    enabled: (entity: string) => i18next.t('mutation-messages.enabled', { entity }),
    disabled: (entity: string) => i18next.t('mutation-messages.disabled', { entity }),
    cloned: (entity: string) => i18next.t('mutation-messages.cloned', { entity }),
    synced: (entity: string) => i18next.t('mutation-messages.synced', { entity }),
    restarted: (entity: string) => i18next.t('mutation-messages.restarted', { entity }),
    reset: (entity: string) => i18next.t('mutation-messages.reset', { entity }),
    authenticated: (entity: string) => i18next.t('mutation-messages.authenticated', { entity }),
    revoked: (entity: string) => i18next.t('mutation-messages.revoked', { entity })
} as const

const special = {
    'User registered successfully': () => i18next.t('mutation-messages.user-registered'),
    'Request sent': () => i18next.t('mutation-messages.request-sent'),
    'Reports truncated successfully': () => i18next.t('mutation-messages.reports-truncated'),
    'Sync queued for nodes with this plugin': () =>
        i18next.t('mutation-messages.plugin-sync-queued'),
    'Sync queued for nodes using this list': () => i18next.t('mutation-messages.list-sync-queued'),
    'Please wait for the nodes to reconnect': () => i18next.t('mutation-messages.wait-for-nodes'),
    'Task added to queue successfully.': () => i18next.t('mutation-messages.task-queued'),
    'Task added to queue successfully': () => i18next.t('mutation-messages.task-queued'),
    'Actions added to queue successfully.': () => i18next.t('mutation-messages.actions-queued'),
    'Nodes updated successfully.': () => i18next.t('mutation-messages.nodes-updated'),
    'Passkey verification successful': () => i18next.t('mutation-messages.passkey-verified'),
    'Users expiration date extended successfully': () =>
        i18next.t('mutation-messages.users-expiration-extended'),
    'All users expiration date extended successfully': () =>
        i18next.t('mutation-messages.all-users-expiration-extended')
} as const

export function translateMutationMessage(message: string): string {
    if (message in special) return special[message as keyof typeof special]()

    const match = message.match(
        /^(.*?) (created|updated|deleted|enabled|disabled|cloned|synced|restarted|reset|authenticated|revoked) successfully\.?$/
    )
    if (!match || !(match[1] in entities) || !(match[2] in verbs)) return message

    return verbs[match[2] as keyof typeof verbs](entityName(match[1] as Entity))
}

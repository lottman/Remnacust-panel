import NiceModal from '@ebay/nice-modal-react'
import { createElement, Suspense, type ComponentProps, type ComponentType } from 'react'
import { lazyWithRecovery as lazy } from '@shared/utils/lazy-with-recovery'

export const MODAL_REGISTRY = {
    helpDrawer: () => import('./universal/help-drawer/help-drawer.shared').then((module) => module.HelpDrawerShared),
    renameModal: () => import('./universal/rename-drawer/rename.drawer').then((module) => module.RenameModalShared),
    editTagsModal: () => import('./universal/edit-tags-modal/edit-tags.modal').then((module) => module.EditTagsModalShared),
    createModal: () => import('./universal/create-modal/create.modal').then((module) => module.CreateModal),
    jsonEditorModal: () => import('./universal/json-editor-modal/json-editor.modal').then((module) => module.JsonEditorModal),
    base64EditorModal: () => import('./universal/base64-editor-modal/base64-editor.modal').then((module) => module.Base64EditorModal),
    quickLinksModal: () => import('./universal/quick-links-modal/quick-links.modal').then((module) => module.QuickLinksModalShared),

    users_viewUserModal: () => import('./users/view-user-modal/view-user.modal').then((module) => module.ViewUserModal),
    users_detailedUserInfoDrawer: () => import('./users/detailed-user-info-drawer/detailed-user-info.drawer').then((module) => module.DetailedUserInfoDrawer),
    users_userAccessibleNodesModal: () => import('./users/user-accessible-nodes-modal/user-accessible-nodes.modal.widget').then((module) => module.UserAccessibleNodesModal),
    users_createUserModal: () => import('./users/create-user-modal/create-user.modal').then((module) => module.CreateUserModal),
    users_userTorrentBlockerReportsModal: () => import('./users/user-torrent-blocker-reports/user-torrent-blocker-reports.drawer').then((module) => module.UserTorrentBlockerReportsModal),
    users_connectionKeysDrawer: () => import('./users/connection-keys-drawer/connection-keys.drawer').then((module) => module.ConnectionKeysDrawer),
    users_subscriptionQrCodeModal: () => import('./users/subscription-qr-code-modal/subscription-qr-code.modal').then((module) => module.SubscriptionQrCodeModal),
    users_userSubscriptionRequestsModal: () => import('./users/user-subscription-requests-modal/user-subscription-requests.modal').then((module) => module.UserSubscriptionRequestsModal),
    users_userHwidDevicesModal: () => import('./users/user-hwid-devices-modal/user-hwid-devices.modal').then((module) => module.UserHwidDevicesModal),
    users_userActiveSessionDrawer: () => import('./users/user-active-sessions/user-active-session.drawer').then((module) => module.UserActiveSessionDrawer),
    users_bulkManyUsersActionsModal: () => import('./users/bulk-many-users-actions/bulk-many-users-actions.modal').then((module) => module.BulkManyUsersActionsModal),
    users_bulkManyUsersUpdateModal: () => import('./users/bulk-many-users-update/bulk-many-users-update.modal').then((module) => module.BulkManyUsersUpdateModal),
    users_bulkAllUsersActionsModal: () => import('./users/bulk-all-users-actions/bulk-all-users-actions.modal').then((module) => module.BulkAllUsersActionsModal),
    users_bulkAllUsersUpdateModal: () => import('./users/bulk-all-users-update/bulk-all-users-update.modal').then((module) => module.BulkAllUsersUpdateModal),

    nodes_createNodeModal: () => import('./nodes/create-node-modal/create-node.modal').then((module) => module.CreateNodeModal),
    nodes_editNodeModal: () => import('./nodes/edit-node-modal/edit-node.modal').then((module) => module.EditNodeModal),
    nodes_nodeUsageStatsDrawer: () => import('./nodes/node-usage-stats/node-usage-stats.drawer').then((module) => module.NodeUsageStatsDrawer),
    nodes_nodesUsageStatsModal: () => import('./nodes/nodes-usage-stats/nodes-usage-stats.modal').then((module) => module.NodesUsageStatsModal),
    nodes_linkedHostsDrawer: () => import('./nodes/linked-hosts-drawer/linked-hosts.drawer').then((module) => module.LinkedHostsDrawer),
    nodes_nodeActiveSessionsDrawer: () => import('./nodes/node-active-sessions-drawer/node-active-sessions.drawer').then((module) => module.NodeActiveSessionsDrawer),
    nodes_nodesConfigProfilesDrawer: () => import('./nodes/nodes-config-profiles-drawer/nodes-config-profiles.drawer').then((module) => module.NodesConfigProfilesDrawer),
    nodes_nodeInboundsHostsDrawer: () => import('./nodes/node-inbounds-hosts-drawer/node-inbounds-hosts.drawer').then((module) => module.NodeInboundsHostsDrawer),
    nodes_nodeGeocheckModal: () => import('./nodes/node-geocheck-modal/node-geocheck.modal').then((module) => module.NodeGeocheckModal),
    nodes_nodeSshTerminal: () => import('./nodes/node-ssh-terminal').then((module) => module.NodeSshTerminalWindow),

    internalSquads_internalSquadsInboundsDrawer: () => import('./internal-squads/internal-squads-inbounds-drawer/internal-squads-inbounds.drawer').then((module) => module.InternalSquadsInboundsDrawer),
    internalSquads_internalSquadAccessibleNodesDrawer: () => import('./internal-squads/internal-squad-accessible-nodes-drawer/internal-squad-accessible-nodes.drawer').then((module) => module.InternalSquadAccessibleNodesDrawer),
    internalSquads_internalSquadsUsageDrawer: () => import('./internal-squads/internal-squads-usage-drawer/internal-squads-usage.drawer').then((module) => module.InternalSquadsUsageDrawer),

    externalSquads_externalSquadsDrawer: () => import('./external-squads/external-squads-drawer/external-squads.drawer').then((module) => module.ExternalSquadsDrawer),

    configProfiles_activeNodesModal: () => import('./config-profiles/active-nodes-modal/active-nodes.modal').then((module) => module.ActiveNodesModal),
    configProfiles_configProfileInboundsDrawer: () => import('./config-profiles/config-profile-inbounds-drawer/config-profile-inbounds.drawer.widget').then((module) => module.ConfigProfileInboundsDrawer),

    nodePlugins_nodePluginExecutorDrawer: () => import('./node-plugins/node-plugin-executor/node-plugin-executor.drawer').then((module) => module.NodePluginExecutorDrawer),

    nodeIntegrations_nodeIntegrationsModal: () => import('./node-integrations/node-integrations-modal/node-integrations.modal').then((module) => module.NodeIntegrationsModal),
    nodeIntegrations_nodeIntegrationEditorModal: () => import('./node-integrations/node-integration-editor-modal/node-integration-editor.modal').then((module) => module.NodeIntegrationEditorModal),

    infraBilling_viewInfraProviderModal: () => import('./infra-billing/view-infra-provider-modal/view-infra-provider.modal').then((module) => module.ViewInfraProviderModal),
    infraBilling_createInfraProviderModal: () => import('./infra-billing/create-infra-provider-modal/create-infra-provider.modal').then((module) => module.CreateInfraProviderModal),
    infraBilling_createInfraBillingNodeModal: () => import('./infra-billing/create-infra-billing-node-modal/create-infra-billing-node.modal').then((module) => module.CreateInfraBillingNodeModal),
    infraBilling_createInfraBillingRecordModal: () => import('./infra-billing/create-infra-billing-record-modal/create-infra-billing-record.modal').then((module) => module.CreateInfraBillingRecordModal),
    infraBilling_updateBillingDateModal: () => import('./infra-billing/update-billing-date-modal/update-billing-date.modal').then((module) => module.UpdateBillingDateModal),

    hosts_createHostDrawer: () => import('./hosts/create-host-drawer/create-host.modal').then((module) => module.CreateHostDrawer),
    hosts_editHostDrawer: () => import('./hosts/edit-host-modal/edit-host.modal').then((module) => module.EditHostDrawer),
    hosts_editManyHostsDrawer: () => import('./hosts/edit-many-hosts-drawer/edit-many-hosts.drawer').then((module) => module.EditManyHostsDrawer),
    hosts_hostMapperModal: () => import('./hosts/host-mapper-modal/host-mapper.modal').then((module) => module.HostMapperModal),
    hosts_hostsConfigProfilesDrawer: () => import('./hosts/hosts-config-profiles-drawer/hosts-config-profiles.drawer.widget').then((module) => module.HostsConfigProfilesDrawer),

    sharedLists_sharedListsModal: () => import('./shared-lists/shared-lists-modal/shared-lists.modal').then((module) => module.SharedListsModal),
    sharedLists_sharedListEditorModal: () => import('./shared-lists/shared-list-editor-modal/shared-list-editor.modal').then((module) => module.SharedListEditorModal),

    snippets_snippetsModal: () => import('./snippets/snippets-modal/snippets.modal').then((module) => module.SnippetsModal),

    rwSettings_passkeysDrawer: () => import('./remnawave-settings/passkeys-drawer/passkeys.drawer').then((module) => module.PasskeysDrawer),
} as const

Object.entries(MODAL_REGISTRY).forEach(([id, load]) => {
    // NiceModal dispatches by string id; showModal checks each id's props through ModalArgs.
    const Modal = lazy(async () => ({ default: (await load()) as unknown as ComponentType<Record<string, unknown>> }))
    NiceModal.register(id, (props) =>
        createElement(Suspense, { fallback: null }, createElement(Modal, props))
    )
})

type Registry = typeof MODAL_REGISTRY
export type ModalId = keyof Registry
export type ModalArgs<K extends ModalId> = Omit<
    ComponentProps<Awaited<ReturnType<Registry[K]>>>,
    'id' | 'keepMounted'
>

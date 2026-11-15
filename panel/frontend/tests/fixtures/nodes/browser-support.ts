export const useGetConfigProfiles = () => ({ data: { configProfiles: [] } })
export const useGetNodePlugins = () => ({ data: { nodePlugins: [] } })
export const useGetNodeIntegrations = () => ({ data: { nodeIntegrations: [] } })
export const useGetInfraBillingNodes = () => ({ data: { billingNodes: [] } })
export const useGetNodes = () => ({ data: [] })
export const usePreventTableBackScroll = () => undefined
export function showModal(_name: string, payload: { nodeUuid: string }) {
    window.dispatchEvent(new CustomEvent('fixture-edit-node', { detail: payload.nodeUuid }))
}

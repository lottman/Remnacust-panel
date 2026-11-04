export const nodeNeedsCustomUpgrade = (message: string | null | undefined): boolean =>
    message?.startsWith('[HOST_POLICY_UPGRADE_REQUIRED]') === true

export const nodePolicyIsPending = (message: string | null | undefined): boolean =>
    nodeNeedsCustomUpgrade(message) || message?.startsWith('[HOST_POLICY_PENDING]') === true

export const nodeUsesCompatibility = (message: string | null | undefined): boolean =>
    message === '[NODE_NATIVE_COMPATIBILITY]' || message === '[NODE_LEGACY_AUTOSELECT]'

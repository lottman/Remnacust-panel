export const nodeNeedsCustomUpgrade = (message: string | null | undefined): boolean =>
    message?.startsWith('[HOST_POLICY_UPGRADE_REQUIRED]') === true

export const nodePolicyIsPending = (message: string | null | undefined): boolean =>
    nodeNeedsCustomUpgrade(message) || message?.startsWith('[HOST_POLICY_PENDING]') === true

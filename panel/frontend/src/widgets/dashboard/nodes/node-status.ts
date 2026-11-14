export type NodeStatus = 'connected' | 'connecting' | 'disabled' | 'disconnected' | 'limited'

interface NodeStatusInput {
    isConnected: boolean
    isConnecting: boolean
    isDisabled: boolean
    xrayUptime?: number
}

export function getNodeStatus(node: NodeStatusInput): NodeStatus {
    if (node.isDisabled) return 'disabled'
    if (node.isConnecting) return 'connecting'
    if (!node.isConnected) return 'disconnected'
    return typeof node.xrayUptime === 'number' &&
        Number.isFinite(node.xrayUptime) &&
        node.xrayUptime > 0
        ? 'connected'
        : 'limited'
}

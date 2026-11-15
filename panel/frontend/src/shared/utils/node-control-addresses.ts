import {
    NODE_CONTROL_ADDRESS_LIMIT,
    NodeIpSchema,
    normalizeNodeControlAddress,
    TNodeControlAddress
} from '@remnawave/backend-contract'

export type NodeControlAddress = TNodeControlAddress
export const MAX_NODE_CONTROL_ADDRESSES = NODE_CONTROL_ADDRESS_LIMIT

interface NodeAddressSource {
    address?: null | string
    controlAddresses?: null | readonly NodeControlAddress[]
    ips?: null | readonly { ip: string; status: string }[]
}

export function getNodeControlAddresses(node: NodeAddressSource): NodeControlAddress[] {
    if (node.controlAddresses != null) {
        return node.controlAddresses.map((entry) => ({ ...entry }))
    }

    const entries: NodeControlAddress[] = []
    const seen = new Set<string>()
    const add = (address: string, enabled: boolean) => {
        const normalized = normalizeNodeControlAddress(address)
        if (!normalized || seen.has(normalized)) return
        seen.add(normalized)
        entries.push({ address: address.trim(), enabled })
    }
    if (node.address) add(node.address, true)
    for (const entry of node.ips ?? []) {
        add(entry.ip, entry.status === 'MANAGEMENT' || entry.status === 'RESERVE')
    }
    return entries
}

export function getPreferredNodeControlAddress(node: NodeAddressSource): string | null {
    return getNodeControlAddresses(node).find((entry) => entry.enabled)?.address ?? null
}

export function getConfiguredNodeAddresses(node: NodeAddressSource): string[] {
    const values = [
        ...(node.controlAddresses ?? []).map((entry) => entry.address),
        ...(node.controlAddresses == null ? [node.address ?? ''] : []),
        ...(node.ips ?? []).map((entry) => entry.ip)
    ]
    return [
        ...new Set(
            values
                .map(normalizeNodeControlAddress)
                .filter((value): value is string => value !== null)
        )
    ]
}

export function normalizeNodeLiteralIp(value: string): string | null {
    const address = value.trim().replace(/^\[([^\]]+)\]$/, '$1')
    return NodeIpSchema.shape.ip.safeParse(address).success
        ? normalizeNodeControlAddress(address)
        : null
}

export function getNodeLiteralIps(node: NodeAddressSource): string[] {
    return getConfiguredNodeAddresses(node).filter(
        (address) => normalizeNodeLiteralIp(address) !== null
    )
}

export function getNodeSshDefaultAddress(node: NodeAddressSource): string {
    return getPreferredNodeControlAddress(node) ?? getConfiguredNodeAddresses(node)[0] ?? ''
}

export function sortNodesByControlAddress<T extends NodeAddressSource>(
    nodes: T[],
    direction: 'asc' | 'desc'
): T[] {
    const multiplier = direction === 'asc' ? 1 : -1
    return [...nodes].sort((left, right) => {
        const a = getPreferredNodeControlAddress(left)
        const b = getPreferredNodeControlAddress(right)
        if (a === null && b === null) return 0
        if (a === null) return 1
        if (b === null) return -1
        return a.localeCompare(b) * multiplier
    })
}

import { GetNodesCommand } from '@remnawave/backend-contract'

type Node = Pick<
    GetNodesCommand.Response['response'][number],
    | 'configProfile'
    | 'isConnected'
    | 'isConnecting'
    | 'isDisabled'
    | 'system'
    | 'xrayUptime'
>

export type NodeHealthLevel = 'attention' | 'critical' | 'disabled' | 'healthy' | 'limited'
export type NodeHealthSignal =
    | 'configuration'
    | 'connection'
    | 'high-load'
    | 'high-memory'
    | 'resources'
    | 'xray'

export interface NodeHealth {
    checkedSignals: number
    issues: NodeHealthSignal[]
    level: NodeHealthLevel
    score: number
    totalSignals: number
    unavailableSignals: NodeHealthSignal[]
}

export function getNodeHealth(node: Node): NodeHealth {
    const totalSignals = 4
    const issues: NodeHealthSignal[] = []
    const unavailableSignals: NodeHealthSignal[] = []

    if (node.isDisabled) {
        return { checkedSignals: 0, issues, level: 'disabled', score: 0, totalSignals, unavailableSignals }
    }

    const configured = Boolean(
        node.configProfile.activeConfigProfileUuid && node.configProfile.activeInbounds.length
    )
    if (!configured) issues.push('configuration')
    if (!node.isConnected && !node.isConnecting) issues.push('connection')

    let checkedSignals = 2
    let passingSignals = Number(configured) + Number(node.isConnected)

    if (node.isConnected && node.xrayUptime > 0) {
        checkedSignals += 1
        passingSignals += 1
    } else {
        unavailableSignals.push('xray')
    }

    const { system } = node
    if (
        node.isConnected &&
        system &&
        system.info.memoryTotal > 0 &&
        system.info.cpus > 0 &&
        Number.isFinite(system.stats.memoryUsed) &&
        Number.isFinite(system.stats.loadAvg[0])
    ) {
        checkedSignals += 1
        const memoryRatio = system.stats.memoryUsed / system.info.memoryTotal
        const loadOneMinute = system.stats.loadAvg[0] / system.info.cpus
        const loadFiveMinutes = Number.isFinite(system.stats.loadAvg[1])
            ? system.stats.loadAvg[1] / system.info.cpus
            : loadOneMinute
        const highLoad = loadFiveMinutes >= 1.5 || (loadOneMinute >= 2.5 && loadFiveMinutes >= 1.25)
        if (memoryRatio >= 0.92) issues.push('high-memory')
        if (highLoad) issues.push('high-load')
        if (memoryRatio < 0.92 && !highLoad) passingSignals += 1
    } else {
        unavailableSignals.push('resources')
    }

    const level: NodeHealthLevel = !configured || (!node.isConnected && !node.isConnecting)
        ? 'critical'
        : node.isConnecting || issues.length > 0
          ? 'attention'
          : checkedSignals < totalSignals
            ? 'limited'
            : 'healthy'

    return {
        checkedSignals,
        issues,
        level,
        score: Math.round((passingSignals / checkedSignals) * 100),
        totalSignals,
        unavailableSignals
    }
}

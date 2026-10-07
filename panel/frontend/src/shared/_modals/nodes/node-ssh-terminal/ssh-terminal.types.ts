import type { GetNodeCommand } from '@remnawave/backend-contract'

export type TStage = 'connecting' | 'failed' | 'session' | 'setup'

export interface ISshTarget {
    host: string
    port: number
    username: string
}

export interface ISshTab {
    id: string
    node: GetNodeCommand.Response['response']
}

export interface ISshSessionStatus {
    nodeUpgrade?: import('./node-upgrade.types').NodeUpgradeEvent
    isConnected: boolean
    size: string
    stage: TStage
    statusText: null | string
    target: ISshTarget
}

export interface ISshSessionHandle {
    upgradeNode: (request: import('./node-upgrade.types').NodeUpgradeRequest) => void
    optimize: (
        level: import('@shared/ui/forms/nodes/base-node-form/optimization-runner').OptimizationLevel,
        id: string
    ) => Promise<void>
    showSettings: () => void
    write: (data: string) => void
}

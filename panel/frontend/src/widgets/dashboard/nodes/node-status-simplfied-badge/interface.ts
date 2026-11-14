export interface IProps {
    isConnected: boolean
    isConnecting: boolean
    isDisabled: boolean
    nodeUuid: string
    lastStatusMessage?: string | null
    xrayUptime?: number
    style?: React.CSSProperties
}

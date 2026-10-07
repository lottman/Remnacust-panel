export interface IProps {
    isConnected: boolean
    isConnecting: boolean
    isDisabled: boolean
    nodeUuid: string
    lastStatusMessage?: string | null
    style?: React.CSSProperties
}

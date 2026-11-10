import {
    GetBandwidthStatsCommand,
    GetRemnawaveHealthCommand,
    GetStatsCommand
} from '@remnawave/backend-contract'

export interface IProps {
    onRefresh: () => Promise<unknown>
    isRefreshing: boolean
    bandwidthStats: GetBandwidthStatsCommand.Response['response']
    remnawaveHealth: GetRemnawaveHealthCommand.Response['response']
    systemInfo: GetStatsCommand.Response['response']
}

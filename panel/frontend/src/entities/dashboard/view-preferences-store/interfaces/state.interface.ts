import type { ILauncherPosition, TQuickLink } from '@shared/ui/quick-launcher/quick-links.types'

import { HOSTS_VIEW_MODE, NODES_VIEW_MODE } from './enums'

export interface IState {
    launcherEnabled: boolean
    launcherPosition: ILauncherPosition | null
    launcherColumns: null | number
    quickLinks: TQuickLink[]
    hostsActiveTag: null | string
    hostsViewMode: HOSTS_VIEW_MODE
    hostsCardColumns: 1 | 2
    nodesActiveTag: null | string
    nodesViewMode: NODES_VIEW_MODE
    nodesCardColumns: 1 | 2
    sectionActiveTags: Record<string, null | string>
}

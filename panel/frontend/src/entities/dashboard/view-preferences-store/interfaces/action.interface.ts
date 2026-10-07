import type { ILauncherPosition, TQuickLink } from '@shared/ui/quick-launcher/quick-links.types'

import { HOSTS_VIEW_MODE, NODES_VIEW_MODE } from './enums'

export interface IActions {
    actions: {
        resetState: () => void
        setLauncherEnabled: (enabled: boolean) => void
        setHostsActiveTag: (tag: null | string) => void
        setLauncherPosition: (position: ILauncherPosition) => void
        setLauncherColumns: (columns: null | number) => void
        setHostsViewMode: (mode: HOSTS_VIEW_MODE) => void
        setHostsCardColumns: (columns: 1 | 2) => void
        setNodesActiveTag: (tag: null | string) => void
        setNodesViewMode: (mode: NODES_VIEW_MODE) => void
        setNodesCardColumns: (columns: 1 | 2) => void
        setQuickLinks: (links: TQuickLink[]) => void
        setSectionActiveTag: (section: string, tag: null | string) => void
    }
}

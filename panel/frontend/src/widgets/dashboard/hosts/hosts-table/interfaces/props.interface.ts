import { UseListStateHandlers } from '@mantine/hooks'
import { GetHostsCommand, GetConfigProfilesCommand } from '@remnawave/backend-contract'
import { RefObject } from 'react'

import { HostStatusFilter } from '@shared/utils/host-status-filter'

export interface IProps {
    statusFilter: HostStatusFilter
    configProfiles: GetConfigProfilesCommand.Response['response']['configProfiles'] | undefined
    handlers: UseListStateHandlers<GetHostsCommand.Response['response'][number]>
    hosts: GetHostsCommand.Response['response'] | undefined
    isDraggingRef: RefObject<boolean>
    selectedHosts: string[]
    setSelectedHosts: React.Dispatch<React.SetStateAction<string[]>>
    state: GetHostsCommand.Response['response']
}

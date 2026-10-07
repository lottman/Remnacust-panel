import { GetNodesCommand } from '@remnawave/backend-contract'

export interface IProps {
    node: Pick<GetNodesCommand.Response['response'][number], 'name' | 'countryCode'> | undefined
}

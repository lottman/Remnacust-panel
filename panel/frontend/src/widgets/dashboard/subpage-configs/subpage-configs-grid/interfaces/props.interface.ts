import { GetSubpageConfigsCommand } from '@remnawave/backend-contract'

export interface IProps {
    configs: GetSubpageConfigsCommand.Response['response']['configs']
}

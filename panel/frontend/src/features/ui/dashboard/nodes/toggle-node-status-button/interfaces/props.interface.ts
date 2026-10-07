import { GetNodeCommand } from '@remnawave/backend-contract'

export interface IProps {
    handleClose: () => void
    node: GetNodeCommand.Response['response']
}

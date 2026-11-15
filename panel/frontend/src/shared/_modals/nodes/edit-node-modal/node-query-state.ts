import { GetNodeCommand } from '@remnawave/backend-contract'
import { QueryClient } from '@tanstack/react-query'

import { nodesQueryKeys } from '@shared/api/hooks/nodes/nodes.query.hooks'

export async function cacheNodeAfterWrite(
    client: QueryClient,
    uuid: string,
    node: GetNodeCommand.Response['response']
) {
    const queryKey = nodesQueryKeys.getNode({ uuid }).queryKey
    await client.cancelQueries({ queryKey, exact: true })
    client.setQueryData(queryKey, node)
}

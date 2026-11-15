import { GetNodeCommand, UpdateNodeCommand } from '@remnawave/backend-contract'

import { getNodeControlAddresses } from '@shared/utils/node-control-addresses'

export function getNodeConnectionValues(node: GetNodeCommand.Response['response']) {
    return {
        controlAddresses: getNodeControlAddresses(node),
        controlRevision: node.controlRevision,
        port: node.port ?? undefined,
        proxyUrl: node.proxyUrl ?? null
    }
}

export function getNodeUpdateValues(
    values: UpdateNodeCommand.RequestBody,
    isDirty: (field: string) => boolean
): UpdateNodeCommand.RequestBody {
    const changed = Object.fromEntries(
        Object.entries(values).filter(([field]) => field !== 'controlRevision' && isDirty(field))
    ) as Partial<UpdateNodeCommand.RequestBody>
    return {
        ...changed,
        uuid: values.uuid,
        ...((changed.controlAddresses !== undefined ||
            changed.port !== undefined ||
            changed.proxyUrl !== undefined) && {
            controlRevision: values.controlRevision
        }),
        ...(changed.configProfile !== undefined && {
            configProfile: {
                activeConfigProfileUuid: changed.configProfile.activeConfigProfileUuid,
                activeInbounds: changed.configProfile.activeInbounds ?? []
            }
        })
    }
}

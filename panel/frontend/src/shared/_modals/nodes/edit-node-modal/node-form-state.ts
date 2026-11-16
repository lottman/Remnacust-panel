import { UseFormReturnType } from '@mantine/form'
import { GetNodeCommand, UpdateNodeCommand } from '@remnawave/backend-contract'

import { getNodeControlAddresses } from '@shared/utils/node-control-addresses'

export function hasNodeConnectionChanges(
    form: Pick<UseFormReturnType<UpdateNodeCommand.RequestBody>, 'isDirty'>
) {
    return form.isDirty('controlAddresses') || form.isDirty('port') || form.isDirty('proxyUrl')
}

export function resetNodeFormDirty(
    form: UseFormReturnType<UpdateNodeCommand.RequestBody>,
    initial: UpdateNodeCommand.RequestBody,
    refreshedFields: readonly string[],
    dirty = form.getDirty()
) {
    form.resetDirty(initial)
    const remaining = Object.fromEntries(
        Object.entries(dirty).filter(
            ([field]) =>
                !refreshedFields.some(
                    (refreshed) => field === refreshed || field.startsWith(`${refreshed}.`)
                )
        )
    )
    for (const field of refreshedFields) {
        if (form.isDirty(field)) remaining[field] = true
    }
    form.setDirty(remaining)
}

export function applyNodeIpScanResult(
    form: UseFormReturnType<UpdateNodeCommand.RequestBody>,
    node: GetNodeCommand.Response['response']
): boolean {
    if (hasNodeConnectionChanges(form)) return false
    const connection = getNodeConnectionValues(node)
    const initial = { ...form.getInitialValues(), ...connection, ips: node.ips ?? [] }
    const ipsDirty = form.isDirty('ips')
    const touched = form.getTouched()
    const dirty = form.getDirty()
    form.setInitialValues(initial)
    for (const [field, value] of Object.entries(connection)) {
        form.setFieldValue(field, value as never)
    }
    if (!ipsDirty) form.setFieldValue('ips', node.ips ?? [])
    const refreshedFields = [...Object.keys(connection), ...(!ipsDirty ? ['ips'] : [])]
    resetNodeFormDirty(form, initial, refreshedFields, dirty)
    form.setTouched(touched)
    return true
}

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
    if (changed.ips !== undefined && values.controlAddresses !== undefined) {
        changed.controlAddresses ??= values.controlAddresses
    }
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

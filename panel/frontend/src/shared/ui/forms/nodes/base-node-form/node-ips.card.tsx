import { Stack } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { CreateNodeCommand, GetNodeCommand, UpdateNodeCommand } from '@remnawave/backend-contract'
import { ForwardRefComponent, HTMLMotionProps, Variants } from 'motion/react'

import { NodeDiagnostics } from '@shared/_modals/nodes/edit-node-modal/node-diagnostics'
import { NodeControlAddressesEditor } from '@shared/ui/node-ips/node-control-addresses-editor'
import { getNodeControlAddresses } from '@shared/utils/node-control-addresses'

interface IProps<T extends CreateNodeCommand.RequestBody | UpdateNodeCommand.RequestBody> {
    cardVariants: Variants
    form: UseFormReturnType<T>
    motionWrapper: ForwardRefComponent<HTMLDivElement, HTMLMotionProps<'div'>>
    node: GetNodeCommand.Response['response']
    disabled?: boolean
}

export const NodeIpsCard = <
    T extends CreateNodeCommand.RequestBody | UpdateNodeCommand.RequestBody
>(
    props: IProps<T>
) => {
    const { cardVariants, disabled, form, motionWrapper, node } = props

    const MotionWrapper = motionWrapper
    const connectionDirty =
        form.isDirty('controlAddresses') || form.isDirty('port') || form.isDirty('proxyUrl')

    return (
        <MotionWrapper variants={cardVariants}>
            <Stack gap="md">
                <NodeControlAddressesEditor
                    disabled={disabled}
                    form={form}
                    hasProxy={node.hasProxy}
                    key={form.key('controlAddresses')}
                    savedAddresses={getNodeControlAddresses(node)}
                />
                <NodeDiagnostics
                    disabled={disabled || connectionDirty}
                    key={node.controlRevision ?? node.uuid}
                    nodeUuid={node.uuid}
                />
            </Stack>
        </MotionWrapper>
    )
}

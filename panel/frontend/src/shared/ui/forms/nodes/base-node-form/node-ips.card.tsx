import { ActionIcon, Stack, Text, Tooltip } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { CreateNodeCommand, GetNodeCommand, UpdateNodeCommand } from '@remnawave/backend-contract'
import { ForwardRefComponent, HTMLMotionProps, Variants } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { TbRefresh } from 'react-icons/tb'

import { NodeDiagnostics } from '@shared/_modals/nodes/edit-node-modal/node-diagnostics'
import { hasNodeConnectionChanges } from '@shared/_modals/nodes/edit-node-modal/node-form-state'
import { NodeControlAddressesEditor } from '@shared/ui/node-ips/node-control-addresses-editor'
import { getNodeControlAddresses } from '@shared/utils/node-control-addresses'

interface IProps<T extends CreateNodeCommand.RequestBody | UpdateNodeCommand.RequestBody> {
    cardVariants: Variants
    form: UseFormReturnType<T>
    motionWrapper: ForwardRefComponent<HTMLDivElement, HTMLMotionProps<'div'>>
    node: GetNodeCommand.Response['response']
    disabled?: boolean
    isRescanningIps?: boolean
    onRescanIps?: () => void
    rescanDisabled?: boolean
}

export const NodeIpsCard = <
    T extends CreateNodeCommand.RequestBody | UpdateNodeCommand.RequestBody
>(
    props: IProps<T>
) => {
    const {
        cardVariants,
        disabled,
        form,
        motionWrapper,
        node,
        isRescanningIps,
        onRescanIps,
        rescanDisabled
    } = props
    const { t, i18n } = useTranslation()

    const MotionWrapper = motionWrapper
    const connectionDirty = hasNodeConnectionChanges(form)
    const addresses = getNodeControlAddresses(node)
    const scanBlocked = node.isDisabled || !addresses.some((entry) => entry.enabled)
    const scanDisabled = Boolean(
        disabled || connectionDirty || scanBlocked || rescanDisabled || !node.controlRevision
    )
    const scanHint = connectionDirty
        ? t('node-control-addresses.rescan-save-first')
        : rescanDisabled || !node.controlRevision
          ? t('requestErrors.codes.A266')
          : scanBlocked
            ? t('requestErrors.codes.A270')
            : t('node-control-addresses.rescan-description')

    return (
        <MotionWrapper variants={cardVariants}>
            <Stack gap="md">
                <NodeControlAddressesEditor
                    disabled={disabled}
                    form={form}
                    hasProxy={node.hasProxy}
                    ips={node.ips ?? []}
                    rescanAction={
                        onRescanIps && (
                            <Tooltip
                                events={{ hover: true, focus: true, touch: true }}
                                label={scanHint}
                                maw={300}
                                multiline
                            >
                                <span
                                    aria-label={t('node-control-addresses.rescan')}
                                    style={{ display: 'inline-flex' }}
                                    tabIndex={scanDisabled || isRescanningIps ? 0 : undefined}
                                >
                                    <ActionIcon
                                        aria-label={t('node-control-addresses.rescan')}
                                        disabled={scanDisabled}
                                        loading={isRescanningIps}
                                        onClick={onRescanIps}
                                        size="md"
                                        type="button"
                                        variant="light"
                                    >
                                        <TbRefresh size={16} />
                                    </ActionIcon>
                                </span>
                            </Tooltip>
                        )
                    }
                    key={form.key('controlAddresses')}
                    savedAddresses={addresses}
                />
                {onRescanIps && (
                    <Text c="dimmed" size="xs">
                        {t('node-control-addresses.discovery-help')}
                    </Text>
                )}
                {onRescanIps && (
                    <Text c="dimmed" size="xs" role="status">
                        {connectionDirty
                            ? t('node-control-addresses.rescan-save-first')
                            : node.ipScan
                              ? t('node-control-addresses.rescan-last', {
                                    date: new Intl.DateTimeFormat(i18n.language, {
                                        dateStyle: 'medium',
                                        timeStyle: 'short'
                                    }).format(new Date(node.ipScan.scannedAt))
                                })
                              : t('node-control-addresses.rescan-never')}
                    </Text>
                )}
                <NodeDiagnostics
                    disabled={disabled || connectionDirty}
                    key={node.controlRevision ?? node.uuid}
                    nodeUuid={node.uuid}
                />
            </Stack>
        </MotionWrapper>
    )
}

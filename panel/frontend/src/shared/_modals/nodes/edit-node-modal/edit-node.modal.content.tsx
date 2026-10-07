import { Tabs } from '@mantine/core'
import { useForm, schemaResolver } from '@mantine/form'
import { UpdateNodeCommand } from '@remnawave/backend-contract'
import { NodeDetailsCardWidget } from '@widgets/dashboard/nodes/node-details-card'
import { NodeSystemCardWidget } from '@widgets/dashboard/nodes/node-system-card'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { queryClient } from '@shared/api'
import {
    configProfilesQueryKeys,
    nodesQueryKeys,
    useGetNode,
    useGetNodeIntegrations,
    useGetNodePlugins,
    useGetNodeSecretKey,
    useUpdateNode
} from '@shared/api/hooks'
import { useUiText } from '@shared/i18n/interface-text'
import { BaseNodeForm } from '@shared/ui/forms/nodes/base-node-form/base-node-form'
import { LoaderModalShared } from '@shared/ui/loader-modal'
import { withNodeIpsErrors } from '@shared/ui/node-ips'

import { NodeHealthHistory } from './node-health-history'

interface IProps {
    nodeUuid: string
    onClose: () => void
}

export const EditNodeByUuidModalContent = (props: IProps) => {
    const uiText = useUiText()

    const { nodeUuid, onClose } = props
    const [activeTab, setActiveTab] = useState<string | null>('settings')

    const isFormInitialized = useRef(false)

    const form = useForm<UpdateNodeCommand.RequestBody>({
        name: 'edit-node-form',
        mode: 'uncontrolled',
        onValuesChange: (values) => {
            if (typeof values.proxyUrl === 'string' && values.proxyUrl === '') {
                form.setFieldValue('proxyUrl', null)
            }
        },
        validate: withNodeIpsErrors(
            schemaResolver(UpdateNodeCommand.RequestBodySchema.omit({ uuid: true }))
        )
    })

    const { data: secretKey } = useGetNodeSecretKey()
    const { data: nodePlugins } = useGetNodePlugins()
    const { data: nodeIntegrations } = useGetNodeIntegrations()

    const { data: fetchedNode } = useGetNode({
        route: {
            uuid: nodeUuid
        },
        rQueryParams: {
            enabled: !form.isTouched()
        }
    })

    const { mutate: updateNode, isPending: isUpdateNodePending } = useUpdateNode({
        mutationFns: {
            onSuccess: async (data) => {
                queryClient.setQueryData(
                    nodesQueryKeys.getNode({
                        uuid: nodeUuid
                    }).queryKey,
                    data
                )

                queryClient.refetchQueries({
                    queryKey: nodesQueryKeys.getAllNodes.queryKey
                })
                queryClient.refetchQueries({
                    queryKey: configProfilesQueryKeys.getConfigProfiles.queryKey
                })

                form.resetDirty()
            }
        }
    })

    useEffect(() => {
        if (fetchedNode && !isFormInitialized.current) {
            isFormInitialized.current = true
            form.initialize({
                uuid: fetchedNode.uuid,
                countryCode: fetchedNode.countryCode,
                name: fetchedNode.name,
                address: fetchedNode.address,
                port: fetchedNode.port ?? undefined,
                isTrafficTrackingActive: fetchedNode.isTrafficTrackingActive ?? undefined,
                trafficLimitBytes: fetchedNode.trafficLimitBytes ?? undefined,
                trafficResetDay: fetchedNode.trafficResetDay ?? undefined,
                notifyPercent: fetchedNode.notifyPercent ?? undefined,
                consumptionMultiplier: fetchedNode.consumptionMultiplier ?? undefined,
                nodeConsumptionMultiplier: fetchedNode.nodeConsumptionMultiplier ?? undefined,
                tags: fetchedNode.tags ?? undefined,
                integrationUuids: fetchedNode.integrationUuids ?? [],
                ips: fetchedNode.ips ?? [],
                proxyUrl: fetchedNode.proxyUrl ?? undefined,
                configProfile: {
                    activeConfigProfileUuid:
                        fetchedNode.configProfile.activeConfigProfileUuid ?? '',
                    activeInbounds:
                        fetchedNode.configProfile.activeInbounds.map((inbound) => inbound.uuid) ??
                        []
                },

                providerUuid: fetchedNode.providerUuid ?? undefined,
                activePluginUuid: fetchedNode.activePluginUuid ?? undefined,
                note: fetchedNode.note ?? undefined
            })
        }
    }, [fetchedNode])

    const handleSubmit = form.onSubmit(async (values) => {
        if (!fetchedNode) {
            return
        }

        const changedValues = Object.fromEntries(
            Object.entries(values).filter(([field]) => form.isDirty(field))
        ) as Partial<UpdateNodeCommand.RequestBody>

        updateNode({
            variables: {
                ...changedValues,
                uuid: fetchedNode.uuid,
                ...(changedValues.configProfile !== undefined && {
                    configProfile: {
                        activeConfigProfileUuid:
                            changedValues.configProfile.activeConfigProfileUuid,
                        activeInbounds: changedValues.configProfile.activeInbounds ?? []
                    }
                })
            }
        })
    })

    if (!fetchedNode || fetchedNode.uuid !== nodeUuid) {
        return (
            <motion.div
                animate={{ opacity: 1 }}
                initial={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
            >
                <LoaderModalShared mih="70vh" />
            </motion.div>
        )
    }

    return (
        <Tabs keepMounted onChange={setActiveTab} value={activeTab}>
            <Tabs.List>
                <Tabs.Tab value="settings">{uiText('settings-74a883a')}</Tabs.Tab>
                <Tabs.Tab value="health">{uiText('health-and-logs-abdf03a')}</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="settings" pt="md">
                {secretKey && nodePlugins && nodeIntegrations ? (
                    <BaseNodeForm
                        form={form}
                        handleClose={onClose}
                        handleSubmit={handleSubmit}
                        isDataSubmitting={isUpdateNodePending}
                        node={fetchedNode}
                        nodeDetailsCard={<NodeDetailsCardWidget node={fetchedNode} />}
                        nodeIntegrations={nodeIntegrations.nodeIntegrations}
                        nodePlugins={nodePlugins.nodePlugins}
                        nodeSystemCard={<NodeSystemCardWidget node={fetchedNode} />}
                        secretKey={secretKey}
                    />
                ) : (
                    <LoaderModalShared mih="50vh" />
                )}
            </Tabs.Panel>
            <Tabs.Panel value="health">
                {activeTab === 'health' && <NodeHealthHistory node={fetchedNode} />}
            </Tabs.Panel>
        </Tabs>
    )
}

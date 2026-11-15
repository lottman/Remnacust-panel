import { Alert, Button, Tabs, Text } from '@mantine/core'
import { useForm, schemaResolver } from '@mantine/form'
import { UpdateNodeCommand } from '@remnawave/backend-contract'
import { NodeDetailsCardWidget } from '@widgets/dashboard/nodes/node-details-card'
import { NodeSystemCardWidget } from '@widgets/dashboard/nodes/node-system-card'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { queryClient } from '@shared/api'
import { RequestError } from '@shared/api/helpers/handler-request-error'
import {
    configProfilesQueryKeys,
    nodesQueryKeys,
    useGetNode,
    useGetNodeIntegrations,
    useGetNodePlugins,
    useGetNodeSecretKey,
    useRescanNodeIps,
    useUpdateNode
} from '@shared/api/hooks'
import { useUiText } from '@shared/i18n/interface-text'
import { BaseNodeForm } from '@shared/ui/forms/nodes/base-node-form/base-node-form'
import { LoaderModalShared } from '@shared/ui/loader-modal'
import { withNodeIpsErrors } from '@shared/ui/node-ips'
import { withNodeControlAddressesErrors } from '@shared/ui/node-ips/validate-node-control-addresses'

import {
    applyNodeIpScanResult,
    getNodeConnectionValues,
    getNodeUpdateValues,
    hasNodeConnectionChanges,
    resetNodeFormDirty
} from './node-form-state'
import { NodeHealthHistory } from './node-health-history'
import { NodePortPlans } from './node-port-plans'
import { useNodePortPlan } from './node-port-plans.api'
import { cacheNodeAfterWrite } from './node-query-state'

interface IProps {
    nodeUuid: string
    onClose: () => void
}

export const EditNodeByUuidModalContent = (props: IProps) => {
    const uiText = useUiText()
    const { t } = useTranslation()

    const { nodeUuid, onClose } = props
    const [activeTab, setActiveTab] = useState<string | null>('settings')
    const [portBusy, setPortBusy] = useState(false)
    const [connectionConflict, setConnectionConflict] = useState(false)
    const [reloadingConnection, setReloadingConnection] = useState(false)
    const [reloadError, setReloadError] = useState(false)
    const [ipScanError, setIpScanError] = useState<string>()
    const connectionOperation = useRef<'save' | 'scan' | null>(null)
    const portPlan = useNodePortPlan(nodeUuid)

    const isFormInitialized = useRef(false)

    const form = useForm<UpdateNodeCommand.RequestBody>({
        name: 'edit-node-form',
        mode: 'uncontrolled',
        onValuesChange: (values) => {
            if (typeof values.proxyUrl === 'string' && values.proxyUrl === '') {
                form.setFieldValue('proxyUrl', null)
            }
        },
        validate: withNodeControlAddressesErrors(
            withNodeIpsErrors(schemaResolver(UpdateNodeCommand.RequestBodySchema))
        )
    })

    const { data: secretKey } = useGetNodeSecretKey()
    const { data: nodePlugins } = useGetNodePlugins()
    const { data: nodeIntegrations } = useGetNodeIntegrations()

    const { mutate: updateNode, isPending: isUpdateNodePending } = useUpdateNode({
        mutationFns: {
            onError: (error) => {
                connectionOperation.current = null
                if (error instanceof RequestError && error.errorCode === 'A266') {
                    setConnectionConflict(true)
                }
                if (error instanceof RequestError && error.errorCode === 'A265') {
                    form.setFieldError('controlAddresses', t('requestErrors.codes.A265'))
                }
            },
            onSuccess: async (data, variables) => {
                await cacheNodeAfterWrite(queryClient, nodeUuid, data)
                connectionOperation.current = null

                queryClient.refetchQueries({
                    queryKey: nodesQueryKeys.getAllNodes.queryKey
                })
                queryClient.refetchQueries({
                    queryKey: configProfilesQueryKeys.getConfigProfiles.queryKey
                })

                const connection = getNodeConnectionValues(data)
                const initial = {
                    ...form.getInitialValues(),
                    ...variables.variables,
                    ...connection
                }
                form.setInitialValues(initial)
                for (const [field, value] of Object.entries(connection)) {
                    form.setFieldValue(field, value as never)
                }
                resetNodeFormDirty(form, initial, [
                    ...Object.keys(connection),
                    ...Object.keys(variables.variables ?? {})
                ])
                setConnectionConflict(false)
            }
        }
    })

    const { mutate: rescanNodeIps, isPending: isRescanningIps } = useRescanNodeIps({
        route: { uuid: nodeUuid },
        mutationFns: {
            onError: (error) => {
                connectionOperation.current = null
                setIpScanError(error.message)
                if (error instanceof RequestError && error.errorCode === 'A266') {
                    setConnectionConflict(true)
                }
            },
            onSuccess: async (data) => {
                await cacheNodeAfterWrite(queryClient, nodeUuid, data)
                connectionOperation.current = null
                queryClient.refetchQueries({ queryKey: nodesQueryKeys.getAllNodes.queryKey })
                setConnectionConflict(!applyNodeIpScanResult(form, data))
                setIpScanError(undefined)
            }
        }
    })

    const { data: fetchedNode, refetch: refetchNode } = useGetNode({
        route: { uuid: nodeUuid },
        rQueryParams: { enabled: !form.isTouched() && !isRescanningIps && !isUpdateNodePending }
    })

    const handleRescanIps = () => {
        if (
            connectionOperation.current ||
            isUpdateNodePending ||
            isRescanningIps ||
            reloadingConnection ||
            portBusy ||
            connectionConflict
        )
            return
        if (hasNodeConnectionChanges(form)) {
            setIpScanError(t('node-control-addresses.rescan-save-first'))
            return
        }
        const controlRevision = form.getValues().controlRevision
        if (!controlRevision) return
        connectionOperation.current = 'scan'
        setIpScanError(undefined)
        rescanNodeIps({ variables: { controlRevision } })
    }

    useEffect(() => {
        if (fetchedNode && fetchedNode.uuid === nodeUuid && !isFormInitialized.current) {
            isFormInitialized.current = true
            form.initialize({
                uuid: fetchedNode.uuid,
                countryCode: fetchedNode.countryCode,
                name: fetchedNode.name,
                address: fetchedNode.address,
                ...getNodeConnectionValues(fetchedNode),
                isTrafficTrackingActive: fetchedNode.isTrafficTrackingActive ?? undefined,
                trafficLimitBytes: fetchedNode.trafficLimitBytes ?? undefined,
                trafficResetDay: fetchedNode.trafficResetDay ?? undefined,
                notifyPercent: fetchedNode.notifyPercent ?? undefined,
                consumptionMultiplier: fetchedNode.consumptionMultiplier ?? undefined,
                nodeConsumptionMultiplier: fetchedNode.nodeConsumptionMultiplier ?? undefined,
                tags: fetchedNode.tags ?? undefined,
                integrationUuids: fetchedNode.integrationUuids ?? [],
                ips: fetchedNode.ips ?? [],
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
        } else if (
            fetchedNode &&
            fetchedNode.uuid === nodeUuid &&
            !isRescanningIps &&
            !isUpdateNodePending &&
            !connectionConflict &&
            fetchedNode.controlRevision !== form.getValues().controlRevision &&
            !hasNodeConnectionChanges(form)
        ) {
            applyNodeIpScanResult(form, fetchedNode)
        }
    }, [fetchedNode])

    const handleSubmit = () =>
        form.onSubmit(async (values) => {
            if (!fetchedNode || connectionOperation.current || reloadingConnection) {
                return
            }

            connectionOperation.current = 'save'
            updateNode({
                variables: structuredClone(
                    getNodeUpdateValues(values, (field) => form.isDirty(field))
                )
            })
        })()

    const reloadConnection = async () => {
        setReloadingConnection(true)
        setReloadError(false)
        try {
            const result = await refetchNode()
            if (!result.data || result.isError) {
                setReloadError(true)
                return
            }
            const connection = getNodeConnectionValues(result.data)
            const initial = { ...form.getInitialValues(), ...connection }
            form.setInitialValues(initial)
            for (const [field, value] of Object.entries(connection)) {
                form.setFieldValue(field, value as never)
            }
            resetNodeFormDirty(form, initial, Object.keys(connection))
            setConnectionConflict(false)
            setIpScanError(undefined)
        } catch {
            setReloadError(true)
        } finally {
            setReloadingConnection(false)
        }
    }

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
                <Tabs.Tab value="settings" disabled={portBusy}>
                    {uiText('settings-74a883a')}
                </Tabs.Tab>
                <Tabs.Tab value="ports" disabled={form.isDirty() || portBusy}>
                    {t('nodePorts.title')}
                </Tabs.Tab>
                <Tabs.Tab value="health" disabled={portBusy}>
                    {uiText('health-and-logs-abdf03a')}
                </Tabs.Tab>
            </Tabs.List>
            {form.isDirty() && activeTab === 'settings' && (
                <Text size="xs" c="dimmed" mt="xs">
                    {t('nodePorts.saveSettings')}
                </Text>
            )}
            <Tabs.Panel value="settings" pt="md">
                {connectionConflict && (
                    <Alert color="yellow" role="alert" mb="md">
                        <Text size="sm">{t('node-control-addresses.conflict')}</Text>
                        <Button
                            mt="sm"
                            variant="light"
                            loading={reloadingConnection}
                            onClick={reloadConnection}
                        >
                            {t('node-control-addresses.reload')}
                        </Button>
                    </Alert>
                )}
                {reloadError && (
                    <Alert color="red" role="alert" mb="md">
                        {t('operations.requestError')}
                    </Alert>
                )}
                {ipScanError && (
                    <Alert color="red" role="alert" mb="md">
                        {ipScanError}
                    </Alert>
                )}
                {secretKey && nodePlugins && nodeIntegrations ? (
                    <BaseNodeForm
                        form={form}
                        handleClose={onClose}
                        handleSubmit={handleSubmit}
                        isDataSubmitting={
                            isUpdateNodePending || reloadingConnection || isRescanningIps
                        }
                        isRescanningIps={isRescanningIps}
                        onRescanIps={handleRescanIps}
                        saveDisabled={connectionConflict}
                        node={fetchedNode}
                        portPlansEnabled={portPlan.data?.enabled ?? false}
                        onManagePorts={() => setActiveTab('ports')}
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
            <Tabs.Panel value="ports" pt="md">
                <NodePortPlans
                    nodeUuid={nodeUuid}
                    active={activeTab === 'ports'}
                    onBusyChange={setPortBusy}
                    onSaved={(state) => {
                        const configProfile = {
                            activeConfigProfileUuid: state.profileUuid ?? '',
                            activeInbounds: state.enabled
                                ? state.bindings.map((b) => b.configProfileInboundUuid)
                                : state.activeInbounds
                        }
                        const values = { ...form.getValues(), configProfile }
                        form.setInitialValues({ ...form.getInitialValues(), configProfile })
                        form.resetDirty(values)
                        form.setFieldValue('configProfile', configProfile)
                        queryClient.invalidateQueries({
                            queryKey: nodesQueryKeys.getAllNodes.queryKey
                        })
                        queryClient.invalidateQueries({
                            queryKey: nodesQueryKeys.getNode({ uuid: nodeUuid }).queryKey
                        })
                    }}
                />
            </Tabs.Panel>
            <Tabs.Panel value="health">
                {activeTab === 'health' && <NodeHealthHistory node={fetchedNode} />}
            </Tabs.Panel>
        </Tabs>
    )
}

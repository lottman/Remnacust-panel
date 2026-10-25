import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Modal, Stepper, Stack, Transition } from '@mantine/core'
import { useForm, schemaResolver } from '@mantine/form'
import { CreateNodeCommand } from '@remnawave/backend-contract'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbCpu } from 'react-icons/tb'

import { useNiceMantineModal } from '@shared/_modals/use-nice-modal'
import { queryClient } from '@shared/api'
import { RequestError } from '@shared/api/helpers/handler-request-error'
import {
    configProfilesQueryKeys,
    QueryKeys,
    useCreateNode,
    useGetNodeSecretKey
} from '@shared/api/hooks'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'

import { CreateNodeStep1Connection } from './create-node-steps/create-node-step-1-connection'
import { CreateNodeStep2ConfigProfiles } from './create-node-steps/create-node-step-2-config-profiles'
import { CreateNodeStep3Status } from './create-node-steps/create-node-step-3-status'

export const CreateNodeModal = NiceModal.create(() => {
    const { t } = useTranslation()

    const modal = useModal()
    const { modalProps, hide } = useNiceMantineModal({
        modal,
        onClose: () => {
            queryClient.refetchQueries({ queryKey: QueryKeys.nodes.getAllNodes.queryKey })
        }
    })

    const { data: secretKey } = useGetNodeSecretKey()

    const [activeStep, setActiveStep] = useState(0)
    const [installMode, setInstallMode] = useState<'ssh' | 'manual'>('ssh')
    const [createdNodeUuid, setCreatedNodeUuid] = useState<string>()
    const [selectedPort, setSelectedPort] = useState<number>(2222)

    const form = useForm<CreateNodeCommand.RequestBody>({
        name: 'create-node-form',
        mode: 'uncontrolled',
        validate: schemaResolver(CreateNodeCommand.RequestBodySchema)
    })

    const { mutate: createNode, isPending: isCreateNodePending } = useCreateNode({
        mutationFns: {
            onError: (error) => {
                if (!(error instanceof RequestError)) return
                const field =
                    error.errorCode === 'A033'
                        ? 'name'
                        : error.errorCode === 'A034'
                          ? 'address'
                          : undefined
                if (!field) return
                form.setFieldError(field, error.message)
                setActiveStep(0)
            },
            onSuccess: (data) => {
                queryClient.refetchQueries({
                    queryKey: configProfilesQueryKeys.getConfigProfiles.queryKey
                })

                setCreatedNodeUuid(data.uuid)
                setActiveStep(2) // Move to status step
            }
        }
    })

    const handleCreateNode = () => {
        if (isCreateNodePending || form.validate().hasErrors) return
        const values = form.getValues()
        createNode({
            variables: {
                ...values,
                name: values.name.trim(),
                address: values.address.trim()
            }
        })
    }

    const nextStep = () => setActiveStep((current) => (current < 2 ? current + 1 : current))
    const prevStep = () => setActiveStep((current) => (current > 0 ? current - 1 : current))

    useEffect(() => {
        if (form.getValues().port) {
            return
        }

        form.setValues({
            port: 2222
        })
    }, [form])

    form.watch('port', ({ value }) => {
        if (value) {
            setSelectedPort(value)
        }
    })

    return (
        <Modal
            {...modalProps}
            size="md"
            title={
                <BaseOverlayHeader
                    iconColor="teal"
                    IconComponent={TbCpu}
                    iconVariant="soft"
                    title={t('create-node-modal.widget.create-node')}
                />
            }
        >
            <Stack gap="xl">
                <Stepper active={activeStep} size="xs" aria-label={t('operations.setupMode')}>
                    <Stepper.Step label={t('operations.setupServer')} />
                    <Stepper.Step label={t('operations.setupProfile')} />
                    <Stepper.Step label={t('operations.setupVerify')} />
                </Stepper>

                <Transition
                    duration={300}
                    exitDuration={0}
                    mounted={activeStep === 0}
                    timingFunction="ease"
                    transition="fade"
                >
                    {(styles) => (
                        <div style={styles}>
                            <CreateNodeStep1Connection
                                form={form}
                                installMode={installMode}
                                onInstallModeChange={setInstallMode}
                                onNext={nextStep}
                                port={selectedPort}
                                secretKey={secretKey?.secretKey}
                            />
                        </div>
                    )}
                </Transition>

                <Transition
                    duration={300}
                    exitDuration={0}
                    mounted={activeStep === 1}
                    timingFunction="ease"
                    transition="fade"
                >
                    {(styles) => (
                        <div style={styles}>
                            <CreateNodeStep2ConfigProfiles
                                form={form}
                                isCreating={isCreateNodePending}
                                onCreateNode={handleCreateNode}
                                onPrev={prevStep}
                                port={selectedPort}
                            />
                        </div>
                    )}
                </Transition>

                <Transition
                    duration={300}
                    exitDuration={0}
                    mounted={activeStep === 2}
                    timingFunction="ease"
                    transition="fade"
                >
                    {(styles) => (
                        <div style={styles}>
                            <CreateNodeStep3Status
                                nodeUuid={createdNodeUuid}
                                onClose={hide}
                                installMode={installMode}
                            />
                        </div>
                    )}
                </Transition>
            </Stack>
        </Modal>
    )
})

import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Modal, Stepper, Stack, Transition } from '@mantine/core'
import { FormErrors, useForm } from '@mantine/form'
import { CreateNodeCommand } from '@remnawave/backend-contract'
import { useRef, useState } from 'react'
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
import {
    CreateNodeFocusRequest,
    focusCreateNodeError,
    getCreateNodeErrors,
    getCreateNodeStepErrors
} from './create-node-validation'

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
    const [focusRequest, setFocusRequest] = useState<CreateNodeFocusRequest>()
    const createPending = useRef(false)

    const form = useForm<CreateNodeCommand.RequestBody>({
        name: 'create-node-form',
        mode: 'uncontrolled',
        initialValues: {
            name: '',
            countryCode: 'XX',
            isTrafficTrackingActive: false,
            configProfile: { activeConfigProfileUuid: '', activeInbounds: [] },
            controlAddresses: [{ address: '', enabled: true }],
            port: 2222
        },
        onValuesChange: (values) => {
            if (values.proxyUrl === '') form.setFieldValue('proxyUrl', null)
        },
        validate: getCreateNodeErrors,
        validateInputOnBlur: ['proxyUrl']
    })

    const showValidationErrors = (errors: FormErrors) => {
        const connectionErrors = getCreateNodeStepErrors(errors, 0)
        const step = Object.keys(connectionErrors).length ? 0 : 1
        const field = Object.keys(
            step === 0 ? connectionErrors : getCreateNodeStepErrors(errors, 1)
        )[0]
        form.setErrors(errors)
        setActiveStep(step)
        if (field) {
            setFocusRequest((current) => ({ field, requestId: (current?.requestId ?? 0) + 1 }))
        }
    }

    const { mutate: createNode, isPending: isCreateNodePending } = useCreateNode({
        mutationFns: {
            onError: (error) => {
                createPending.current = false
                if (!(error instanceof RequestError)) return
                const field =
                    error.errorCode === 'A033'
                        ? 'name'
                        : error.errorCode === 'A034'
                          ? 'controlAddresses'
                          : error.errorCode === 'A265'
                            ? 'controlAddresses'
                            : undefined
                if (!field) return
                showValidationErrors({ [field]: error.message })
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

    const handleCreateNode = async () => {
        if (createPending.current || isCreateNodePending || createdNodeUuid) return
        createPending.current = true
        const values = structuredClone(form.getValues())
        const validation = await form.validate()
        if (validation.hasErrors) {
            createPending.current = false
            showValidationErrors(validation.errors)
            return
        }
        createNode({
            variables: {
                ...values,
                name: values.name.trim()
            }
        })
    }

    const nextStep = async () => {
        const validation = await form.validate()
        const errors = getCreateNodeStepErrors(validation.errors, 0)
        form.setErrors(errors)
        if (Object.keys(errors).length) {
            showValidationErrors(errors)
            return
        }
        setFocusRequest(undefined)
        setActiveStep(1)
    }
    const prevStep = () => {
        setFocusRequest(undefined)
        setActiveStep((current) => (current > 0 ? current - 1 : current))
    }

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
                    onEntered={() => {
                        if (!focusRequest) return
                        focusCreateNodeError(form, focusRequest.field)
                        requestAnimationFrame(() => focusCreateNodeError(form, focusRequest.field))
                    }}
                    timingFunction="ease"
                    transition="fade"
                >
                    {(styles) => (
                        <div style={styles}>
                            <CreateNodeStep1Connection
                                focusRequest={focusRequest}
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
                                focusRequest={focusRequest}
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

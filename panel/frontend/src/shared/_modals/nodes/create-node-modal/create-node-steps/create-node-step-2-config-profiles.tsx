import { ShowConfigProfilesWithInboundsFeature } from '@features/ui/dashboard/nodes/show-config-profiles-with-inbounds'
import { Alert, Button, Group, Skeleton, Stack } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { CreateNodeCommand } from '@remnawave/backend-contract'
import { useEffect, useEffectEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { PiArrowLeft } from 'react-icons/pi'
import { SiSecurityscorecard } from 'react-icons/si'
import { TbCheck } from 'react-icons/tb'

import { useGetConfigProfiles } from '@shared/api/hooks'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { SectionCard } from '@shared/ui/section-card'

import {
    CreateNodeFocusRequest,
    focusCreateNodeError,
    getCreateNodeStepErrors
} from '../create-node-validation'
import { CopyDockerComposeWidget } from './copy-docker-compose.widget'

interface IProps {
    // oxlint-disable-next-line
    form: UseFormReturnType<CreateNodeCommand.RequestBody, any>
    focusRequest?: CreateNodeFocusRequest
    isCreating: boolean
    onCreateNode: () => void
    onPrev: () => void
    port: number
}

export const CreateNodeStep2ConfigProfiles = ({
    form,
    focusRequest,
    isCreating,
    onCreateNode,
    onPrev,
    port
}: IProps) => {
    const { t } = useTranslation()

    const { data: configProfiles, isLoading: isConfigProfilesLoading } = useGetConfigProfiles()

    const saveInbounds = (inbounds: string[], configProfileUuid: string) => {
        form.setValues({
            configProfile: {
                activeInbounds: inbounds,
                activeConfigProfileUuid: configProfileUuid
            }
        })
        form.setTouched({
            activeConfigProfileUuid: true,
            activeInbounds: true
        })
        form.setDirty({
            activeConfigProfileUuid: true,
            activeInbounds: true
        })
    }

    const focusError = useEffectEvent(() => {
        if (focusRequest) focusCreateNodeError(form, focusRequest.field)
    })
    useEffect(() => {
        if (!focusRequest) return
        const frame = requestAnimationFrame(() => focusError())
        return () => cancelAnimationFrame(frame)
    }, [focusRequest])
    const profileError = Object.values(getCreateNodeStepErrors(form.errors, 1))[0]

    return (
        <Stack
            component="form"
            gap="xl"
            mih={400}
            onSubmit={(event) => {
                event.preventDefault()
                onCreateNode()
            }}
        >
            <Stack
                aria-label={t('base-node-form.core-configuration')}
                aria-invalid={Boolean(profileError)}
                aria-describedby={profileError ? 'create-node-profile-error' : undefined}
                role="group"
                data-path={
                    (form.getInputProps('configProfile') as { 'data-path'?: string })['data-path']
                }
                tabIndex={-1}
            >
                {profileError && (
                    <Alert color="red" role="alert" id="create-node-profile-error">
                        {t(
                            'show-config-profiles-with-inbounds.feature.choose-a-profile-to-configure-inbounds-for-this-node'
                        )}
                    </Alert>
                )}
                <SectionCard.Root>
                    <SectionCard.Section>
                        <BaseOverlayHeader
                            iconColor="teal"
                            IconComponent={SiSecurityscorecard}
                            iconVariant="soft"
                            title={t('base-node-form.core-configuration')}
                            titleOrder={5}
                        />
                    </SectionCard.Section>
                    <SectionCard.Section>
                        {isConfigProfilesLoading && (
                            <Stack gap="md">
                                <Skeleton height={24} width="40%" />
                                <Skeleton height={16} width="60%" />
                                <Skeleton height={76} radius="md" />
                                <Skeleton height={25} radius="sm" width="100%" />
                            </Stack>
                        )}

                        {!isConfigProfilesLoading && configProfiles && (
                            <ShowConfigProfilesWithInboundsFeature
                                activeConfigProfileInbounds={
                                    form.getValues().configProfile?.activeInbounds ?? []
                                }
                                activeConfigProfileUuid={
                                    form.getValues().configProfile?.activeConfigProfileUuid
                                }
                                configProfiles={configProfiles.configProfiles}
                                errors={profileError}
                                onSaveInbounds={saveInbounds}
                            />
                        )}
                    </SectionCard.Section>
                </SectionCard.Root>
            </Stack>

            <Stack gap="xs" mt="auto">
                <CopyDockerComposeWidget port={port} />

                <Group justify="space-between">
                    <Button
                        color="gray"
                        disabled={isCreating}
                        leftSection={<PiArrowLeft size={18} />}
                        onClick={onPrev}
                        size="md"
                    >
                        {t('create-node-modal.widget.back')}
                    </Button>
                    <Button
                        color="teal"
                        leftSection={<TbCheck size={18} />}
                        loading={isCreating}
                        size="md"
                        type="submit"
                    >
                        {t('create-node-modal.widget.create-node')}
                    </Button>
                </Group>
            </Stack>
        </Stack>
    )
}

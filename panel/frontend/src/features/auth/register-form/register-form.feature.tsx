import { Button, Paper, PasswordInput, Stack, TextInput } from '@mantine/core'
import { useForm, schemaResolver } from '@mantine/form'
import { useClipboard } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { RegisterCommand } from '@remnawave/backend-contract'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { PiShuffleDuotone, PiSignpostDuotone } from 'react-icons/pi'

import { useRegister } from '@shared/api/hooks'
import { useAuth } from '@shared/hooks/use-auth'
import { handleFormErrors } from '@shared/utils/misc'

export const RegisterFormFeature = () => {
    const { t } = useTranslation()

    const { setIsAuthenticated } = useAuth()

    const { copy, copied, error } = useClipboard()

    const form = useForm({
        validate: {
            ...schemaResolver(RegisterCommand.RequestBodySchema),
            confirmPassword: (value, values) =>
                value !== values.password
                    ? t('register-form.feature.passwords-do-not-match')
                    : null,
            password: (value) =>
                value.length < 12 ? t('register-form.feature.password-too-short') : null
        },
        initialValues: {
            username: '',
            password: '',
            confirmPassword: ''
        }
    })

    const { mutate: register, isPending: isLoading } = useRegister({
        mutationFns: {
            onSuccess: () => setIsAuthenticated(true),
            onError: (error) => {
                handleFormErrors(form, error)
            }
        }
    })

    const handleGeneratePassword = () => {
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        const bytes = crypto.getRandomValues(new Uint8Array(32))
        const newPassword = Array.from(bytes, (b) => charset[b % charset.length]).join('')

        form.setValues({
            ...form.values,
            password: newPassword,
            confirmPassword: newPassword
        })

        copy(newPassword)
    }

    useEffect(() => {
        if (error) {
            notifications.show({
                title: t('common.message.error'),
                message: t('register-form.feature.password-copied-error')
            })
        }

        if (copied) {
            notifications.show({
                title: t('register-form.feature.password-copied'),
                message: t('register-form.feature.password-copied-message')
            })
        }
    }, [error, copied])

    const handleSubmit = form.onSubmit((variables) => {
        register({
            variables: {
                username: variables.username,
                password: variables.password
            }
        })
    })

    return (
        <form onSubmit={handleSubmit}>
            <Paper p={0} withBorder={false}>
                <TextInput
                    label={t('common.field.username')}
                    placeholder={t('common.field.username')}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    readOnly={isLoading}
                    required
                    size="md"
                    {...form.getInputProps('username')}
                />

                <Stack mt="md">
                    <PasswordInput
                        label={t('common.field.password')}
                        placeholder={t('common.field.password')}
                        autoComplete="new-password"
                        readOnly={isLoading}
                        visibilityToggleButtonProps={{
                            'aria-label': t('design-ui.toggle-password')
                        }}
                        required
                        size="md"
                        style={{ flex: 1 }}
                        {...form.getInputProps('password')}
                    />

                    <PasswordInput
                        label={t('register-form.feature.confirm-password')}
                        placeholder={t('common.field.password')}
                        autoComplete="new-password"
                        readOnly={isLoading}
                        visibilityToggleButtonProps={{
                            'aria-label': t('design-ui.toggle-password')
                        }}
                        required
                        size="md"
                        {...form.getInputProps('confirmPassword')}
                    />

                    <Button
                        fullWidth
                        leftSection={<PiShuffleDuotone size="16px" />}
                        onClick={handleGeneratePassword}
                        size="md"
                    >
                        {t('register-form.feature.generate')}
                    </Button>
                </Stack>

                <Button
                    fullWidth
                    leftSection={<PiSignpostDuotone size="16px" />}
                    loading={isLoading}
                    mt="xl"
                    size="md"
                    type="submit"
                    variant="default"
                >
                    {t('register-form.feature.sign-up')}
                </Button>
            </Paper>
        </form>
    )
}

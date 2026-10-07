import { Button, Paper, PasswordInput, Stack, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useClipboard } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { PiShuffleDuotone, PiSignpostDuotone } from 'react-icons/pi'
import { ZodError } from 'zod'

import { useRegister } from '@shared/api/hooks'
import { useAuth } from '@shared/hooks/use-auth'
import { handleFormErrors } from '@shared/utils/misc'

import { generateRegistrationPassword, registrationErrors } from './registration'

export const RegisterFormFeature = () => {
    const { t } = useTranslation()

    const { setIsAuthenticated } = useAuth()

    const { copy, copied, error } = useClipboard()

    const form = useForm({
        validateInputOnBlur: true,
        validate: (values) =>
            Object.fromEntries(
                Object.entries(registrationErrors(values)).map(([field, message]) => [
                    field,
                    t(message)
                ])
            ),
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
                if (error instanceof ZodError) {
                    form.setErrors(
                        Object.fromEntries(
                            Object.entries(registrationErrors(form.values)).map(
                                ([field, message]) => [field, t(message)]
                            )
                        )
                    )
                } else handleFormErrors(form, error)
            }
        }
    })

    const handleGeneratePassword = () => {
        let newPassword: string
        try {
            newPassword = generateRegistrationPassword()
        } catch {
            notifications.show({
                title: t('common.message.error'),
                message: t('register-form.feature.password-generation-error'),
                color: 'red'
            })
            return
        }

        form.setValues({
            ...form.values,
            password: newPassword,
            confirmPassword: newPassword
        })
        form.clearFieldError('password')
        form.clearFieldError('confirmPassword')

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
    }, [error, copied, t])

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
                        description={
                            form.errors.password
                                ? undefined
                                : t('register-form.feature.password-requirements')
                        }
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
                        disabled={isLoading}
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

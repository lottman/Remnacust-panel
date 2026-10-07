import { Button, Paper, PasswordInput, TextInput } from '@mantine/core'
import { useForm, schemaResolver } from '@mantine/form'
import { LoginCommand } from '@remnawave/backend-contract'
import { IconLogin2 } from '@tabler/icons-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useLogin } from '@shared/api/hooks'
import { useAuth } from '@shared/hooks/use-auth'
import { handleFormErrors } from '@shared/utils/misc'

import classes from './login-form.module.css'

export const LoginFormFeature = () => {
    const { t } = useTranslation()
    const [visible, setVisible] = useState(false)

    const { setIsAuthenticated } = useAuth()

    const form = useForm({
        mode: 'uncontrolled',
        validate: schemaResolver(LoginCommand.RequestBodySchema),
        initialValues: { username: '', password: '' }
    })

    const { mutate: login, isPending: isLoading } = useLogin()

    const handleSubmit = form.onSubmit((variables) => {
        login(
            {
                variables: {
                    username: variables.username,
                    password: variables.password
                }
            },
            {
                onSuccess: () => {
                    setIsAuthenticated(true)
                },
                onError: (error) => handleFormErrors(form, error)
            }
        )
    })

    return (
        <form className={`xera-login-form ${classes.form}`} onSubmit={handleSubmit}>
            <Paper className={classes.surface} p={0} withBorder={false}>
                <TextInput
                    label={t('common.field.username')}
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    readOnly={isLoading}
                    size="md"
                    placeholder={t('common.field.username')}
                    required
                    {...form.getInputProps('username')}
                />
                <PasswordInput
                    label={t('common.field.password')}
                    mt="md"
                    name="password"
                    autoComplete="current-password"
                    readOnly={isLoading}
                    size="md"
                    visible={visible}
                    onVisibilityChange={setVisible}
                    visibilityToggleButtonProps={{
                        'aria-label': t(
                            visible ? 'design-ui.hide-password' : 'design-ui.show-password'
                        )
                    }}
                    placeholder={t('login-form.feature.your-password')}
                    required
                    {...form.getInputProps('password')}
                />
                <Button
                    fullWidth
                    leftSection={<IconLogin2 aria-hidden="true" size={18} stroke={2} />}
                    loading={isLoading}
                    mt="xl"
                    size="md"
                    type="submit"
                    variant="filled"
                >
                    {t('login-form.feature.sign-in')}
                </Button>
            </Paper>
        </form>
    )
}

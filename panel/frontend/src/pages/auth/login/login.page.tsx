import { LoginFormFeature } from '@features/auth/login-form'
import { OAuth2LoginButtonsFeature } from '@features/auth/oauth2-login-button/oauth2-login-button.feature'
import { PasskeyLoginButtonFeature } from '@features/auth/passkey-login-button'
import { RegisterFormFeature } from '@features/auth/register-form'
import {
    Alert,
    Button,
    Skeleton,
    Box,
    Center,
    Card,
    Divider,
    Group,
    Stack,
    Text,
    Title,
    useMantineColorScheme
} from '@mantine/core'
import { GetStatusCommand } from '@remnawave/backend-contract'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useGetAuthStatus } from '@shared/api/hooks/auth/auth.query.hooks'
import { BrandLogo } from '@shared/ui/brand-logo'
import { Page } from '@shared/ui/page'
import { parseColoredTextUtil } from '@shared/utils/misc'

import classes from './login.module.css'

const getAuthMethods = (authStatus: GetStatusCommand.Response['response'] | undefined) => {
    const isPasswordEnabled = authStatus?.authentication?.password?.enabled ?? false
    const isPasskeyEnabled = authStatus?.authentication?.passkey?.enabled ?? false
    const isOAuth2Enabled =
        Object.values(authStatus?.authentication?.oauth2?.providers ?? {}).some(Boolean) ?? false

    return {
        isOAuth2Enabled,
        isPasskeyEnabled,
        isPasswordEnabled,
        hasAlternativeMethods: isPasskeyEnabled || isOAuth2Enabled,
        hasPrimaryMethods: isPasswordEnabled
    }
}

const BrandTitle = ({ titleParts }: { titleParts: Array<{ color: string; text: string }> }) => {
    const { colorScheme } = useMantineColorScheme()
    return (
        <Title className={classes.brandTitle} order={1} pos="relative">
            {titleParts.map((part, index) => (
                <Text
                    c={
                        colorScheme === 'light' && (!part.color || part.color === 'white')
                            ? 'var(--panel-text)'
                            : part.color || 'var(--panel-text)'
                    }
                    component="span"
                    fw="inherit"
                    fz="inherit"
                    inherit
                    key={index}
                    pos="relative"
                >
                    {part.text}
                </Text>
            ))}
        </Title>
    )
}

const AlternativeAuthMethods = ({
    authentication,
    isOAuth2Enabled,
    isPasskeyEnabled,
    isPasswordEnabled
}: {
    authentication: GetStatusCommand.Response['response']['authentication']
    isOAuth2Enabled: boolean
    isPasskeyEnabled: boolean
    isPasswordEnabled: boolean
}) => (
    <Center>
        <Stack gap="md" maw={isPasswordEnabled ? 300 : 150} w="100%">
            {isPasskeyEnabled && authentication && (
                <PasskeyLoginButtonFeature authentication={authentication} />
            )}
            {isOAuth2Enabled && authentication && (
                <OAuth2LoginButtonsFeature authentication={authentication} />
            )}
        </Stack>
    </Center>
)

export const LoginPage = () => {
    const { t } = useTranslation()
    const { data: authStatus, dataUpdatedAt, isPending, isFetching, refetch } = useGetAuthStatus()

    const titleParts = useMemo(() => {
        if (authStatus?.branding.title) {
            return parseColoredTextUtil(authStatus.branding.title)
        }

        return [{ text: 'Remnacust', color: 'var(--panel-text)' }]
    }, [authStatus])

    const isRegister = !authStatus?.isLoginAllowed && authStatus?.isRegisterAllowed
    const authMethods = getAuthMethods(authStatus)

    return (
        <Page title={t('auth-localization.login-title')}>
            <Box className={classes.grid}>
                <Stack className={classes.brand} gap="lg">
                    <Group align="center" gap={12}>
                        <BrandLogo
                            logoUrl={authStatus?.branding.logoUrl}
                            retryKey={dataUpdatedAt}
                            size={40}
                        />
                        <BrandTitle titleParts={titleParts} />
                    </Group>
                    <Text className={classes.intro}>{t('design-ui.login-intro')}</Text>
                </Stack>
                <Card className={classes.form} p={{ base: 20, sm: 28 }}>
                    <Title order={3} mb={6}>
                        {t(
                            isRegister
                                ? 'register-form.feature.registration'
                                : 'auth-localization.login-title'
                        )}
                    </Title>
                    <Text size="sm" c="dimmed" mb="xl">
                        {t(
                            isRegister
                                ? 'register-form.feature.register-description'
                                : 'design-ui.login-description'
                        )}
                    </Text>

                    {!authStatus && isPending && (
                        <Stack role="status" aria-label={t('common.message.loading')} gap="md">
                            <Skeleton height={66} />
                            <Skeleton height={66} />
                            <Skeleton height={44} mt="sm" />
                        </Stack>
                    )}
                    {!authStatus && !isPending && (
                        <Alert color="red" title={t('auth-localization.server-unavailable')}>
                            <Button
                                mt="md"
                                variant="light"
                                loading={isFetching}
                                onClick={() => void refetch()}
                            >
                                {t('common.action.try-again')}
                            </Button>
                        </Alert>
                    )}

                    {!isRegister && authStatus && authStatus.authentication && (
                        <Box w="100%">
                            <Stack gap="lg">
                                {authMethods.isPasswordEnabled && <LoginFormFeature />}

                                {authMethods.hasPrimaryMethods &&
                                    authMethods.hasAlternativeMethods && (
                                        <Center>
                                            <Divider
                                                label={t('auth-localization.or')}
                                                labelPosition="center"
                                                maw="400px"
                                                w="100%"
                                            />
                                        </Center>
                                    )}

                                {authMethods.hasAlternativeMethods && (
                                    <AlternativeAuthMethods
                                        authentication={authStatus.authentication}
                                        isOAuth2Enabled={authMethods.isOAuth2Enabled}
                                        isPasskeyEnabled={authMethods.isPasskeyEnabled}
                                        isPasswordEnabled={authMethods.isPasswordEnabled}
                                    />
                                )}
                            </Stack>
                        </Box>
                    )}

                    {isRegister && (
                        <Box w="100%">
                            <RegisterFormFeature />
                        </Box>
                    )}
                </Card>
            </Box>
        </Page>
    )
}

export default LoginPage

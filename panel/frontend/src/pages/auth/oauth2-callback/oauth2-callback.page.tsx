import { Center, Loader, Stack, Text, Title, Transition } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { TOAuth2ProvidersKeys } from '@remnawave/backend-contract'
import { IconCheck } from '@tabler/icons-react'
import { CSSProperties, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import { useOauth2Callback } from '@shared/api/hooks'
import { ROUTES } from '@shared/constants'
import { useAuth } from '@shared/hooks/use-auth'
import { useUiText } from '@shared/i18n/interface-text'
import { Page } from '@shared/ui/page'
import { consumeOAuth2State } from '@shared/utils/oauth2-state.util'
import { consumeReturnTo } from '@shared/utils/return-to.util'

export const Oauth2CallbackPage = () => {
    const uiText = useUiText()

    const { provider } = useParams()
    const { setIsAuthenticated } = useAuth()

    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const handledCallback = useRef(false)

    const code = searchParams.get('code')
    const state = searchParams.get('state')

    const { mutate: oauth2Callback, isPending } = useOauth2Callback({
        mutationFns: {
            onSuccess: () => {
                setIsAuthenticated(true)

                navigate(consumeReturnTo() ?? ROUTES.DASHBOARD.HOME, { replace: true })
            },
            onError: (error) => {
                notifications.show({
                    title: uiText('oauth2-callback-2493959'),
                    message: error.message,
                    color: 'red'
                })
                setIsAuthenticated(false)

                navigate(ROUTES.AUTH.LOGIN, { replace: true })
            }
        }
    })

    useEffect(() => {
        // React may run the effect again while the first exchange is in flight.
        if (handledCallback.current) return
        handledCallback.current = true

        if (!code || !state || !provider || !consumeOAuth2State(provider, state)) {
            notifications.show({
                title: uiText('oauth2-callback-2493959'),
                message: uiText(
                    'login-state-is-missing-expired-or-invalid-start-login-again-7630c41'
                ),
                color: 'red'
            })
            navigate(ROUTES.AUTH.LOGIN, { replace: true })
            return
        }

        oauth2Callback({
            variables: {
                provider: provider as TOAuth2ProvidersKeys,
                code,
                state
            }
        })
    }, [code, state, provider])

    return (
        <Page title={uiText('oauth2-authentication-5df84fc')}>
            <Center style={{ minHeight: '60vh' }}>
                <Stack align="center" gap="xl">
                    <Transition
                        duration={300}
                        mounted={true}
                        timingFunction="ease"
                        transition="fade"
                    >
                        {(styles: CSSProperties) => (
                            <div style={styles}>
                                {isPending ? (
                                    <Loader size="xl" variant="dots" />
                                ) : (
                                    <IconCheck color="teal" size={48} />
                                )}
                            </div>
                        )}
                    </Transition>
                    <div>
                        <Title mb="md" order={2} ta="center">
                            {uiText('authenticating-1f6087c')}
                        </Title>
                        <Text c="dimmed" ta="center">
                            {uiText('verifying-credentials-c4c1b4e')}
                        </Text>
                    </div>
                </Stack>
            </Center>
        </Page>
    )
}

export default Oauth2CallbackPage

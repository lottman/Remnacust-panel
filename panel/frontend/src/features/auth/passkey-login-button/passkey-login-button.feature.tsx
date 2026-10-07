import { Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { GetStatusCommand } from '@remnawave/backend-contract'
import {
    type PublicKeyCredentialRequestOptionsJSON,
    startAuthentication
} from '@simplewebauthn/browser'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbFingerprint } from 'react-icons/tb'

import { usePasskeyAuthenticationOptions, usePasskeyAuthenticationVerify } from '@shared/api/hooks'
import { useAuth } from '@shared/hooks/use-auth'

interface IProps {
    authentication: NonNullable<GetStatusCommand.Response['response']['authentication']>
}

export const PasskeyLoginButtonFeature = (props: IProps) => {
    const { t } = useTranslation()
    const { authentication } = props

    const [isLoading, setIsLoading] = useState(false)

    const { setIsAuthenticated } = useAuth()

    const { mutateAsync: verifyAuthentication, isPending } = usePasskeyAuthenticationVerify()
    const { refetch } = usePasskeyAuthenticationOptions()

    const handlePasskeyLogin = async () => {
        setIsLoading(true)

        try {
            const verificationOptions = await refetch()

            const authenticationResponse = await startAuthentication({
                optionsJSON: verificationOptions.data as PublicKeyCredentialRequestOptionsJSON
            })

            await verifyAuthentication(
                {
                    variables: {
                        response: authenticationResponse
                    }
                },
                {
                    onSuccess: () => {
                        setIsAuthenticated(true)
                    }
                }
            )
        } catch (error: unknown) {
            if (error instanceof Error) {
                if (error.name === 'NotAllowedError') {
                    notifications.show({
                        title: t('auth-localization.passkey-authentication'),
                        message: t('auth-localization.authentication-cancelled'),
                        color: 'yellow'
                    })
                } else if (error.name === 'NotSupportedError') {
                    notifications.show({
                        title: t('auth-localization.passkey-authentication'),
                        message: t('auth-localization.passkey-unsupported'),
                        color: 'red'
                    })
                }
            }
        } finally {
            setIsLoading(false)
        }
    }

    if (!authentication.passkey.enabled) return null

    return (
        <Button
            color="dark"
            leftSection={<TbFingerprint color="white" size={20} />}
            loaderProps={{ type: 'dots' }}
            loading={isLoading || isPending}
            onClick={handlePasskeyLogin}
            variant="filled"
        >
            {t('auth-localization.passkey')}
        </Button>
    )
}

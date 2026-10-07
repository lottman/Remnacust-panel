import { notifications } from '@mantine/notifications'
import axios from 'axios'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { clearQueryClient } from '@shared/api'
import { instance } from '@shared/api/axios'
import { ROUTES } from '@shared/constants'
import { logoutEvents } from '@shared/emitters'
import { resetAllStores } from '@shared/hocs/store-wrapper'
import { useUiText } from '@shared/i18n/interface-text'

import { removeToken } from '@entities/auth'

import { useAuth } from './use-auth'

export function useLogout() {
    const uiText = useUiText()

    const { setIsAuthenticated } = useAuth()
    const navigate = useNavigate()
    const [pending, setPending] = useState(false)
    const running = useRef(false)

    const logout = async () => {
        if (running.current) return
        running.current = true
        setPending(true)
        try {
            try {
                await instance.post('/api/auth/logout', undefined, { timeout: 15_000 })
            } catch (error) {
                // A rejected credential already has no authenticated access.
                if (!axios.isAxiosError(error) || error.response?.status !== 401) {
                    throw error
                }
            }
            logoutEvents.emit()
            setIsAuthenticated(false)
            removeToken()
            resetAllStores()
            clearQueryClient()
            navigate(ROUTES.AUTH.LOGIN)
        } catch {
            notifications.show({
                color: 'red',
                title: uiText('sign-out-failed-cc017f6'),
                message: uiText(
                    'the-server-could-not-confirm-session-revocation-please-try-aga-eee8add'
                )
            })
        } finally {
            running.current = false
            setPending(false)
        }
    }

    return { logout, pending }
}

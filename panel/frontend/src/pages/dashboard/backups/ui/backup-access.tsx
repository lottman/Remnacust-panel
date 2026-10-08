import { Alert, Button, Paper, PasswordInput, Stack, Text } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TbDatabase, TbLock, TbLockOpen } from 'react-icons/tb'

import { instance } from '@shared/api/axios'
import { useUiText } from '@shared/i18n/interface-text'
import { PageHeaderShared } from '@shared/ui/page-header/page-header.shared'

type Session = { token: string; expiresAt: number }
const isBackupUrl = (url?: string) => /^\/api\/backups(?:\/|$)/.test(url ?? '')
const revoke = (token: string) =>
    instance
        .post(
            '/api/backups/session/lock',
            {},
            {
                headers: { 'x-backup-session': token }
            }
        )
        .catch(() => undefined)

function BackupTransport({
    session,
    lock,
    children
}: {
    session: Session
    lock: () => void
    children: ReactNode
}) {
    const client = useQueryClient()
    const [ready, setReady] = useState(false)
    const lease = useRef({ generation: 0, token: '' })
    useEffect(() => {
        let active = true
        const generation = ++lease.current.generation
        lease.current.token = session.token
        const request = instance.interceptors.request.use((config) => {
            if (isBackupUrl(config.url) && !config.headers.has('x-backup-session'))
                config.headers.set('x-backup-session', session.token)
            return config
        })
        const response = instance.interceptors.response.use(undefined, (error) => {
            if (active && isBackupUrl(error.config?.url) && error.response?.status === 403) lock()
            return Promise.reject(error)
        })
        const timer = setTimeout(lock, Math.max(0, session.expiresAt - Date.now()))
        window.addEventListener('pagehide', lock)
        // Child queries must wait until the external Axios interceptors are installed.
        // oxlint-disable-next-line react/set-state-in-effect, react-hooks-js/set-state-in-effect
        setReady(true)
        return () => {
            active = false
            clearTimeout(timer)
            window.removeEventListener('pagehide', lock)
            instance.interceptors.request.eject(request)
            instance.interceptors.response.eject(response)
            void client.cancelQueries({ queryKey: ['backups'] })
            client.removeQueries({ queryKey: ['backups'] })
            // React StrictMode replays effects; revoke only an actually abandoned visit.
            queueMicrotask(() => {
                if (
                    lease.current.generation === generation ||
                    lease.current.token !== session.token
                )
                    void revoke(session.token)
            })
        }
    }, [client, session, lock])
    return ready ? children : null
}

export function BackupAccess({ children }: { children: (lock: () => void) => ReactNode }) {
    const uiText = useUiText()
    const { t } = useTranslation()

    const [password, setPassword] = useState('')
    const [session, setSession] = useState<Session | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const mounted = useRef(true)
    const pending = useRef(false)
    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])
    const lock = useCallback(() => {
        setSession(null)
        setPassword('')
    }, [])
    if (session)
        return (
            <BackupTransport session={session} lock={lock}>
                {children(lock)}
            </BackupTransport>
        )
    return (
        <Stack gap="md">
            <PageHeaderShared
                title={uiText('backups-3334fee')}
                description={uiText('encrypted-database-backups-a7d7cca')}
                icon={<TbDatabase size={24} />}
            />
            <Paper withBorder p="lg" radius="md" maw={520} w="100%">
                <form
                    autoComplete="off"
                    onSubmit={async (event) => {
                        event.preventDefault()
                        if (pending.current) return
                        pending.current = true
                        setBusy(true)
                        setError('')
                        try {
                            const result = await instance.post<{ response: Session }>(
                                '/api/backups/session/unlock',
                                { password }
                            )
                            if (!mounted.current) {
                                void revoke(result.data.response.token)
                                return
                            }
                            setPassword('')
                            setSession(result.data.response)
                        } catch (cause) {
                            if (!mounted.current) return
                            const status = (cause as { response?: { status?: number } }).response
                                ?.status
                            setError(
                                status === 403
                                    ? uiText('incorrect-backup-password-7e314a0')
                                    : status === 429
                                      ? uiText('wait-a-minute-and-try-again-20060e1')
                                      : uiText(
                                            'could-not-unlock-backups-check-the-backup-verification-key-on--c5ef946'
                                        )
                            )
                            setPassword('')
                        } finally {
                            pending.current = false
                            if (mounted.current) setBusy(false)
                        }
                    }}
                >
                    <Stack gap="md">
                        <Text fw={600}>{uiText('unlock-backups-ad83206')}</Text>
                        <Text c="dimmed" size="sm">
                            {uiText(
                                'enter-your-backup-password-you-will-need-it-again-on-your-next-456b306'
                            )}
                        </Text>
                        <PasswordInput
                            label={uiText('backup-password-3e39703')}
                            leftSection={<TbLock size={16} />}
                            value={password}
                            autoComplete="off"
                            required
                            maxLength={256}
                            visibilityToggleButtonProps={{
                                'aria-label': t('design-ui.toggle-password')
                            }}
                            disabled={busy}
                            onChange={(event) => setPassword(event.currentTarget.value)}
                        />
                        {error && (
                            <Alert color="red" role="alert">
                                {error}
                            </Alert>
                        )}
                        <Button
                            type="submit"
                            loading={busy}
                            disabled={!password}
                            variant="soft"
                            leftSection={<TbLockOpen size={17} />}
                            w="fit-content"
                        >
                            {uiText('unlock-backups-ad83206')}
                        </Button>
                    </Stack>
                </form>
            </Paper>
        </Stack>
    )
}

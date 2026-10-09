import { Box, Button, Loader, Modal, Stack, Text } from '@mantine/core'
import { useReducedMotion } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import {
    usePanelUpdateMonitor,
    usePanelUpdateStore
} from '@entities/dashboard/panel-update/panel-update'

export function PanelUpdateGate({ children }: { children: React.ReactNode }) {
    const { t } = useTranslation()
    const reducedMotion = useReducedMotion()
    usePanelUpdateMonitor()
    const { status, observedJob, starting, dismiss } = usePanelUpdateStore()
    const failed = status?.phase === 'failed' && status.jobId === observedJob
    const blocked = Boolean(starting || observedJob || status?.active)
    useEffect(() => {
        if (!blocked) return
        modals.closeAll()
        const original = new Map<HTMLElement, boolean>()
        const lockPortals = () => {
            for (const element of document.body.children) {
                if (
                    !(element instanceof HTMLElement) ||
                    element.id === 'remnacust-panel-update-portal'
                )
                    continue
                if (!original.has(element)) original.set(element, element.inert)
                element.inert = true
            }
        }
        lockPortals()
        const observer = new MutationObserver(lockPortals)
        observer.observe(document.body, { childList: true })
        return () => {
            observer.disconnect()
            for (const [element, inert] of original) element.inert = inert
        }
    }, [blocked])
    return (
        <>
            <Box style={{ display: 'contents' }} inert={blocked} aria-hidden={blocked || undefined}>
                {children}
            </Box>
            <Modal
                opened={blocked}
                onClose={() => {}}
                withCloseButton={false}
                closeOnClickOutside={false}
                closeOnEscape={false}
                centered
                size="sm"
                zIndex={10000}
                portalProps={{ id: 'remnacust-panel-update-portal', reuseTargetNode: false }}
                transitionProps={{ transition: 'fade', duration: reducedMotion ? 0 : 160 }}
                title={t(failed ? 'panelUpdate.failed' : 'panelUpdate.running')}
            >
                <Stack align="center" gap="md" role="status" aria-live="polite">
                    {!failed && <Loader size="sm" />}
                    <Text size="sm" ta="center">
                        {failed
                            ? t(
                                  status?.error === 'RELEASE_NOT_READY'
                                      ? 'panelUpdate.releaseNotReady'
                                      : 'panelUpdate.failureHint'
                              )
                            : t(
                                  status?.phase === 'checking' || status?.phase === 'queued'
                                      ? 'panelUpdate.checking'
                                      : 'panelUpdate.wait'
                              )}
                    </Text>
                    {failed && (
                        <Button onClick={dismiss} variant="default">
                            {t('panelUpdate.return')}
                        </Button>
                    )}
                </Stack>
            </Modal>
        </>
    )
}

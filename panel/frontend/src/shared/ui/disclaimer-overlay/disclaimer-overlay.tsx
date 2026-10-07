import { Anchor, Button, Divider, List, Modal, Stack, Text, ThemeIcon } from '@mantine/core'
import { Trans, useTranslation } from 'react-i18next'
import { PiCheckCircle, PiGavel, PiShieldWarning } from 'react-icons/pi'

import { useDisclaimerAccepted, useMiscStoreActions } from '@entities/dashboard/misc-store'

const warningColor = 'light-dark(#875100, var(--mantine-color-yellow-4))'

export function DisclaimerOverlay() {
    const { t } = useTranslation()

    const disclaimerAccepted = useDisclaimerAccepted()
    const actions = useMiscStoreActions()

    const handleAccept = () => {
        actions.setDisclaimerAccepted(true)
    }

    const highlightComponents = {
        highlight: <Text c="var(--panel-text)" component="span" fw={700} />,
        warning: <Text c={warningColor} component="span" fw={700} />
    }

    return (
        <Modal
            centered
            closeOnClickOutside={false}
            closeOnEscape={false}
            onClose={() => undefined}
            opened={!disclaimerAccepted}
            padding="xl"
            size="lg"
            withCloseButton={false}
        >
            <Stack align="center" gap="lg">
                <ThemeIcon
                    c={warningColor}
                    color="yellow"
                    size={64}
                    style={{
                        background: 'rgba(250, 204, 21, 0.1)',
                        border: '2px solid rgba(250, 204, 21, 0.3)'
                    }}
                    variant="light"
                >
                    <PiShieldWarning size="36px" />
                </ThemeIcon>

                <Stack align="center" gap="xs">
                    <Modal.Title
                        c={warningColor}
                        ff="var(--mantine-font-family-headings)"
                        fw="var(--mantine-h3-font-weight)"
                        fz="var(--mantine-h3-font-size)"
                        lh="var(--mantine-h3-line-height)"
                        ta="center"
                    >
                        {t('disclaimer-overlay.title')}
                    </Modal.Title>

                    <Text c="var(--panel-muted)" fw={700} size="sm" ta="center">
                        {t('disclaimer-overlay.subtitle')}
                    </Text>
                </Stack>

                <Divider color="yellow.4" opacity={0.3} variant="dashed" w="100%" />

                <Stack gap="md" w="100%">
                    <Text c="var(--panel-text)" size="sm">
                        <Trans
                            components={highlightComponents}
                            i18nKey="disclaimer-overlay.intro"
                        />
                    </Text>

                    <List
                        center
                        icon={
                            <ThemeIcon
                                c={warningColor}
                                color="yellow"
                                radius="xl"
                                size={20}
                                variant="light"
                            >
                                <PiGavel size="12px" />
                            </ThemeIcon>
                        }
                        size="sm"
                        spacing="sm"
                    >
                        <List.Item>
                            <Text c="var(--panel-text)" size="sm">
                                <Trans
                                    components={highlightComponents}
                                    i18nKey="disclaimer-overlay.responsibility"
                                />
                            </Text>
                        </List.Item>
                        <List.Item>
                            <Text c="var(--panel-text)" size="sm">
                                <Trans
                                    components={highlightComponents}
                                    i18nKey="disclaimer-overlay.compliance"
                                />
                            </Text>
                        </List.Item>
                        <List.Item>
                            <Text c="var(--panel-text)" size="sm">
                                <Trans
                                    components={highlightComponents}
                                    i18nKey="disclaimer-overlay.liability"
                                />
                            </Text>
                        </List.Item>
                    </List>

                    <Text c="var(--panel-muted)" size="xs" ta="center">
                        <Trans
                            components={{
                                anchor: (
                                    <Anchor
                                        fw={600}
                                        href="https://github.com/lottman/Remnacust-panel/blob/main/LICENSE"
                                        rel="noopener noreferrer"
                                        size="xs"
                                        target="_blank"
                                    />
                                )
                            }}
                            i18nKey="disclaimer-overlay.license-acknowledgement"
                        />
                    </Text>
                </Stack>

                <Button
                    c={warningColor}
                    color="yellow"
                    fullWidth
                    leftSection={<PiCheckCircle size="18px" />}
                    onClick={handleAccept}
                    size="md"
                    variant="light"
                >
                    {t('disclaimer-overlay.accept-button')}
                </Button>
            </Stack>
        </Modal>
    )
}

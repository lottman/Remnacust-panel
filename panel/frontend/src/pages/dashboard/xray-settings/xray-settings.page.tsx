import {
    Alert,
    Badge,
    Button,
    Container,
    Group,
    List,
    Radio,
    SimpleGrid,
    Stack,
    Text,
    Title,
    UnstyledButton
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbCpu, TbShieldCheck } from 'react-icons/tb'

import { instance } from '@shared/api/axios'
import {
    useXrayMode,
    XRAY_MODE_ENDPOINT,
    XRAY_MODE_QUERY_KEY,
    type XrayModeState
} from '@shared/api/hooks/xray-mode'
import { LoadingScreen, Page, PageHeaderShared } from '@shared/ui'
import { SectionCard } from '@shared/ui/section-card'

type Blocker = { code: string; id?: string; name?: string; paths?: string[] }
const features = [
    'host-limits',
    'device-speed-limits',
    'destination-rules',
    'inactive-host-access',
    'autoselect-quota-owner',
    'live-port-plans',
    'xera-http'
] as const

export function XraySettingsPage() {
    const { t } = useTranslation()
    const settings = useXrayMode()
    const client = useQueryClient()
    const [draft, setDraft] = useState<XrayModeState['mode'] | null>(null)
    const selected = draft ?? settings.data?.mode ?? 'custom'
    const check = useQuery({
        queryKey: [...XRAY_MODE_QUERY_KEY, 'default-check'],
        queryFn: async () =>
            (await instance.get(`${XRAY_MODE_ENDPOINT}/default-check`, { timeout: 25000 })).data
                .response as { blockers: Blocker[] },
        enabled: selected === 'default',
        staleTime: 0
    })
    const save = useMutation({
        mutationFn: async () =>
            (
                await instance.patch(
                    XRAY_MODE_ENDPOINT,
                    { mode: selected, expectedRevision: settings.data!.revision },
                    { timeout: 30000 }
                )
            ).data.response as XrayModeState,
        onSuccess: async (state) => {
            client.setQueryData(XRAY_MODE_QUERY_KEY, state)
            setDraft(null)
            await client.invalidateQueries({ queryKey: XRAY_MODE_QUERY_KEY })
        }
    })
    const blockers = check.data?.blockers ?? []
    const dirty = !!settings.data && selected !== settings.data.mode
    if (settings.isPending) return <LoadingScreen />
    return (
        <Page title={t('xray-settings.title' as never)}>
            <PageHeaderShared
                icon={<TbCpu size={24} />}
                title={t('xray-settings.title' as never)}
            />
            <Container fluid p={0} size="xl">
                <Stack gap="lg">
                    {settings.isError ? (
                        <Alert color="red">
                            <Group justify="space-between">
                                <Text>{t('xray-settings.read-error' as never)}</Text>
                                <Button onClick={() => void settings.refetch()}>
                                    {t('common.action.refresh')}
                                </Button>
                            </Group>
                        </Alert>
                    ) : (
                        <>
                            <SectionCard.Root>
                                <SectionCard.Section>
                                    <Stack gap="sm">
                                        <Group justify="space-between">
                                            <Title order={4}>
                                                {t('xray-settings.selection' as never)}
                                            </Title>
                                            <Badge variant="light">
                                                {t(
                                                    `xray-settings.${settings.data?.mode}-title` as never
                                                )}
                                            </Badge>
                                        </Group>
                                        <Text c="dimmed" size="sm">
                                            {t('xray-settings.scope' as never)}
                                        </Text>
                                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                                            {(['custom', 'default'] as const).map((mode) => (
                                                <UnstyledButton
                                                    key={mode}
                                                    onClick={() => {
                                                        setDraft(mode)
                                                        save.reset()
                                                    }}
                                                    aria-pressed={selected === mode}
                                                    p="md"
                                                    style={{
                                                        border: `1px solid ${selected === mode ? 'var(--mantine-primary-color-filled)' : 'var(--panel-border)'}`,
                                                        borderRadius: 'var(--mantine-radius-md)',
                                                        background:
                                                            selected === mode
                                                                ? 'var(--mantine-primary-color-light)'
                                                                : 'var(--panel-surface)'
                                                    }}
                                                >
                                                    <Stack gap="sm">
                                                        <Group justify="space-between">
                                                            <Text fw={600}>
                                                                {t(
                                                                    `xray-settings.${mode}-title` as never
                                                                )}
                                                            </Text>
                                                            <Radio
                                                                checked={selected === mode}
                                                                readOnly
                                                                tabIndex={-1}
                                                                aria-hidden
                                                            />
                                                        </Group>
                                                        <Text c="dimmed" size="sm">
                                                            {t(
                                                                `xray-settings.${mode}-description` as never
                                                            )}
                                                        </Text>
                                                    </Stack>
                                                </UnstyledButton>
                                            ))}
                                        </SimpleGrid>
                                        <Text size="sm" c="dimmed">
                                            {t('xray-settings.restart-note' as never)}
                                        </Text>
                                        {selected === 'default' && check.isPending && (
                                            <Text size="sm">
                                                {t('xray-settings.checking' as never)}
                                            </Text>
                                        )}
                                        {selected === 'default' && check.isError && (
                                            <Alert color="red">
                                                {t('xray-settings.check-error' as never)}
                                            </Alert>
                                        )}
                                        {selected === 'default' && blockers.length > 0 && (
                                            <Alert
                                                color="yellow"
                                                title={t('xray-settings.blocked' as never)}
                                            >
                                                <Stack gap="sm">
                                                    <Text size="sm">
                                                        {t('xray-settings.blocked-help' as never)}
                                                    </Text>
                                                    <List size="sm">
                                                        {blockers.map((blocker, index) => (
                                                            <List.Item
                                                                key={`${blocker.code}:${blocker.id ?? index}`}
                                                            >
                                                                {t(
                                                                    `xray-settings.blockers.${blocker.code}` as never
                                                                )}
                                                                {blocker.name
                                                                    ? ` · ${blocker.name}`
                                                                    : ''}
                                                                {blocker.paths?.length
                                                                    ? ` · ${blocker.paths.join(', ')}`
                                                                    : ''}
                                                            </List.Item>
                                                        ))}
                                                    </List>
                                                </Stack>
                                            </Alert>
                                        )}
                                        {save.isError && (
                                            <Alert color="red">
                                                {t('xray-settings.save-error' as never)}
                                            </Alert>
                                        )}
                                        {save.isSuccess && (
                                            <Alert color="teal">
                                                {t('xray-settings.applied' as never)}
                                            </Alert>
                                        )}
                                        <Group justify="flex-end">
                                            <Button
                                                disabled={
                                                    !dirty ||
                                                    (selected === 'default' &&
                                                        (check.isPending ||
                                                            check.isError ||
                                                            blockers.length > 0))
                                                }
                                                loading={save.isPending}
                                                onClick={() => save.mutate()}
                                            >
                                                {t('xray-settings.apply' as never)}
                                            </Button>
                                        </Group>
                                    </Stack>
                                </SectionCard.Section>
                            </SectionCard.Root>
                            <SectionCard.Root>
                                <SectionCard.Section>
                                    <Stack gap="md">
                                        <Group gap="sm">
                                            <TbShieldCheck size={22} />
                                            <Title order={4}>
                                                {t('xray-settings.features-title' as never)}
                                            </Title>
                                        </Group>
                                        <Text size="sm" c="dimmed">
                                            {t('xray-settings.base-features' as never)}
                                        </Text>
                                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                                            {features.map((feature) => (
                                                <Group
                                                    key={feature}
                                                    justify="space-between"
                                                    wrap="wrap"
                                                >
                                                    <Text size="sm">
                                                        {t(
                                                            `xray-settings.features.${feature}` as never
                                                        )}
                                                    </Text>
                                                    <Badge
                                                        color={
                                                            selected === 'custom' ? 'teal' : 'gray'
                                                        }
                                                        variant="light"
                                                    >
                                                        {t(
                                                            `xray-settings.${selected === 'custom' ? 'available' : 'requires-custom'}` as never
                                                        )}
                                                    </Badge>
                                                </Group>
                                            ))}
                                        </SimpleGrid>
                                    </Stack>
                                </SectionCard.Section>
                            </SectionCard.Root>
                        </>
                    )}
                </Stack>
            </Container>
        </Page>
    )
}

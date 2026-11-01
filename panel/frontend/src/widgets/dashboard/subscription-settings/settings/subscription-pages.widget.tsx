import { Alert, Badge, Button, Group, Loader, Stack, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { TbWorld } from 'react-icons/tb'

import { instance } from '@shared/api/axios'
import { SectionCard } from '@shared/ui/section-card'
import { SettingsCardShared } from '@shared/ui/settings-card'

import { SubscriptionDomainsWidget } from './subscription-domains.widget'

type Operation = 'start' | 'stop' | 'restart' | 'upgrade'
type PageInstance = {
    id: string
    name: string
    domain: string
    status: string
    running: boolean
    image: string
    companion: boolean
    managed?: boolean
    job: null | {
        phase: 'queued' | 'running' | 'completed' | 'failed'
        operation: Operation
        error: string | null
    }
}
const key = ['local-subscription-pages'] as const

export function SubscriptionPagesWidget() {
    return (
        <Stack gap="md">
            <SubscriptionDomainsWidget />
            <ManagedSubscriptionPagesWidget />
        </Stack>
    )
}

function ManagedSubscriptionPagesWidget() {
    const { t } = useTranslation()
    const cache = useQueryClient()
    const query = useQuery({
        queryKey: key,
        queryFn: async () =>
            (
                await instance.get<{ response: { pages: PageInstance[] } }>(
                    '/api/system/subscription-pages'
                )
            ).data.response,
        retry: false,
        refetchInterval: (state) =>
            state.state.data?.pages.some(
                (page) => page.job && ['queued', 'running'].includes(page.job.phase)
            )
                ? 3000
                : 30000,
        refetchIntervalInBackground: false
    })
    const action = useMutation({
        mutationFn: async (variables: { pageId: string; operation: Operation }) => {
            const { data } = await instance.post('/api/system/subscription-pages/action', {
                ...variables,
                requestId: crypto.randomUUID()
            })
            return data.response
        },
        onSuccess: (data) => {
            cache.setQueryData(key, data)
        }
    })
    return (
        <SettingsCardShared.Container>
            <SettingsCardShared.Header
                title={t('subscription-pages.title')}
                description={t('subscription-pages.help')}
                icon={<TbWorld size={24} />}
                actions={
                    <Button
                        variant="default"
                        loading={query.isFetching}
                        onClick={() => {
                            void query.refetch()
                            void cache.invalidateQueries({ queryKey: ['subscription-domains'] })
                        }}
                    >
                        {t('subscription-pages.refresh')}
                    </Button>
                }
            />
            <Stack gap="md">
                {query.isLoading && <Loader aria-label={t('subscription-pages.loading')} />}
                {query.isError && (
                    <Alert color="yellow">{t('subscription-pages.unavailable')}</Alert>
                )}
                {action.isError && <Alert color="red">{t('subscription-pages.failed')}</Alert>}
                {query.isSuccess && !query.data.pages.length && (
                    <Alert color="blue">{t('subscription-pages.empty')}</Alert>
                )}
                {query.data?.pages.map((page) => {
                    const busy =
                        action.isPending ||
                        query.data.pages.some(
                            (item) => item.job && ['queued', 'running'].includes(item.job.phase)
                        )
                    return (
                        <SectionCard.Root key={page.id}>
                            <SectionCard.Section>
                                <Stack gap="sm">
                                    <Group justify="space-between" wrap="wrap">
                                        <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                                            {page.name}
                                        </Text>
                                        <Badge color={page.running ? 'teal' : 'gray'}>
                                            {t(
                                                page.running
                                                    ? 'subscription-pages.running'
                                                    : 'subscription-pages.stopped'
                                            )}
                                        </Badge>
                                    </Group>
                                    {page.domain && (
                                        <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                                            {page.domain}
                                        </Text>
                                    )}
                                    {page.managed === false && (
                                        <Alert
                                            color="blue"
                                            title={t('subscription-pages.legacy-title')}
                                        >
                                            {t('subscription-pages.legacy-help')}
                                        </Alert>
                                    )}
                                    <Text c="dimmed" size="xs" style={{ overflowWrap: 'anywhere' }}>
                                        {page.image}
                                    </Text>
                                    {page.job && ['queued', 'running'].includes(page.job.phase) && (
                                        <Text size="sm" c="blue" role="status">
                                            {t('subscription-pages.working')}
                                        </Text>
                                    )}
                                    {page.job?.phase === 'failed' && (
                                        <Alert color="red">{t('subscription-pages.failed')}</Alert>
                                    )}
                                    <Group wrap="wrap">
                                        {(['start', 'stop', 'restart', 'upgrade'] as const).map(
                                            (operation) => (
                                                <Button
                                                    key={operation}
                                                    variant="light"
                                                    color={operation === 'stop' ? 'red' : undefined}
                                                    disabled={
                                                        busy ||
                                                        (operation === 'upgrade' &&
                                                            page.managed === false) ||
                                                        (operation === 'start' && page.running) ||
                                                        (operation === 'stop' && !page.running)
                                                    }
                                                    onClick={() =>
                                                        action.mutate({
                                                            pageId: page.id,
                                                            operation
                                                        })
                                                    }
                                                >
                                                    {t(`subscription-pages.${operation}`)}
                                                </Button>
                                            )
                                        )}
                                    </Group>
                                </Stack>
                            </SectionCard.Section>
                        </SectionCard.Root>
                    )
                })}
            </Stack>
        </SettingsCardShared.Container>
    )
}

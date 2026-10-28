import { Alert, Badge, Button, Group, Loader, Stack, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { instance } from '@shared/api/axios'
import { SectionCard } from '@shared/ui/section-card'

type Operation = 'start' | 'stop' | 'restart' | 'upgrade'
type PageInstance = {
    id: string
    name: string
    domain: string
    status: string
    running: boolean
    image: string
    companion: boolean
    job: null | {
        phase: 'queued' | 'running' | 'completed' | 'failed'
        operation: Operation
        error: string | null
    }
}
const key = ['local-subscription-pages'] as const

export function SubscriptionPagesWidget() {
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
    if (query.isLoading) return <Loader aria-label={t('subscription-pages.loading')} />
    if (query.isError) return <Alert color="yellow">{t('subscription-pages.unavailable')}</Alert>
    return (
        <Stack gap="md">
            <Group justify="space-between">
                <Text c="dimmed" size="sm">
                    {t('subscription-pages.help')}
                </Text>
                <Button
                    variant="default"
                    loading={query.isFetching}
                    onClick={() => void query.refetch()}
                >
                    {t('subscription-pages.refresh')}
                </Button>
            </Group>
            {action.isError && <Alert color="red">{t('subscription-pages.failed')}</Alert>}
            {!query.data?.pages.length && (
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
                                                color={operation === 'stop' ? 'red' : 'cyan'}
                                                disabled={
                                                    busy ||
                                                    (operation === 'start' && page.running) ||
                                                    (operation === 'stop' && !page.running)
                                                }
                                                onClick={() =>
                                                    action.mutate({ pageId: page.id, operation })
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
    )
}

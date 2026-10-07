import { Alert, Badge, Button, Card, Group, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { TbArrowBackUp, TbClock } from 'react-icons/tb'
import { z } from 'zod'

import { instance } from '@shared/api'
import { useUiText } from '@shared/i18n/interface-text'

const revisionSchema = z.object({
    response: z.array(
        z.object({
            uuid: z.uuid(),
            name: z.string(),
            config: z.unknown(),
            createdAt: z.iso.datetime()
        })
    )
})

interface Props {
    profileUuid: string
    onRestore: (revision: { uuid: string; config: unknown }) => void
}

export function ProfileHistory({ profileUuid, onRestore }: Props) {
    const uiText = useUiText()

    const { i18n } = useTranslation()
    const { data, isError, isPending, refetch } = useQuery({
        queryKey: ['config-profile-revisions', profileUuid],
        queryFn: async () => {
            const result = await instance.get(
                `/api/config-profiles/${encodeURIComponent(profileUuid)}/revisions`
            )
            return revisionSchema.parse(result.data).response
        },
        staleTime: 15_000
    })

    if (isPending) return <Text c="dimmed">{uiText('loading-history-a960c43')}</Text>
    if (isError)
        return (
            <Alert color="red" title={uiText('history-unavailable-cf319f4')}>
                <Group justify="space-between">
                    <Text size="sm">
                        {uiText('check-that-the-panel-and-its-database-are-up-to-date-e05ae6c')}
                    </Text>
                    <Button onClick={() => refetch()} size="xs" variant="light">
                        {uiText('retry-942087c')}
                    </Button>
                </Group>
            </Alert>
        )

    return (
        <Stack gap="sm">
            <Text c="dimmed" size="sm">
                {uiText('the-30-latest-versions-are-retained-restore-opens-an-unsaved-d-275da0f')}
            </Text>
            {data.length === 0 && (
                <Text c="dimmed" size="sm">
                    {uiText(
                        'no-snapshots-yet-the-first-edit-of-an-existing-profile-will-pr-6bf0903'
                    )}
                </Text>
            )}
            {data.map((revision, index) => (
                <Card key={revision.uuid} padding="md" radius="md" withBorder>
                    <Group justify="space-between" wrap="wrap">
                        <Group gap="sm">
                            <TbClock size={18} />
                            <div>
                                <Text fw={600} size="sm">
                                    {revision.name}
                                </Text>
                                <Text c="dimmed" size="xs">
                                    {new Date(revision.createdAt).toLocaleString(i18n.language)}
                                </Text>
                            </div>
                            {index === 0 && (
                                <Badge color="teal" variant="light">
                                    {uiText('latest-8730d3c')}
                                </Badge>
                            )}
                        </Group>
                        <Button
                            leftSection={<TbArrowBackUp size={16} />}
                            onClick={() => onRestore(revision)}
                            size="xs"
                            variant="light"
                        >
                            {uiText('open-in-editor-ea1d0f0')}
                        </Button>
                    </Group>
                </Card>
            ))}
        </Stack>
    )
}

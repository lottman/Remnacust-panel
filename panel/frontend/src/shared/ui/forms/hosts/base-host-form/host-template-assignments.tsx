import { Alert, Anchor, Badge, Button, Group, Loader, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { generatePath, Link } from 'react-router'

import { useHostTemplateAssignments } from '@shared/api/hooks/hosts/host-template-assignments.query'
import { ROUTES } from '@shared/constants'

export function HostTemplateAssignments({ uuid }: { uuid: string }) {
    const { t } = useTranslation()
    const query = useHostTemplateAssignments(uuid)
    return (
        <Stack gap="xs">
            <Text fw={600} size="sm">
                {t('host-template-assignments.title')}
            </Text>
            {query.isPending ? (
                <Loader size="xs" aria-label={t('common.message.loading')} />
            ) : query.isError ? (
                <Alert color="yellow">
                    <Stack gap="xs">
                        <Text size="xs">{t('host-template-assignments.error')}</Text>
                        <Button
                            type="button"
                            size="compact-xs"
                            variant="subtle"
                            onClick={() => void query.refetch()}
                        >
                            {t('common.action.refresh')}
                        </Button>
                    </Stack>
                </Alert>
            ) : query.data ? (
                <>
                    <Badge variant="light" w="fit-content">
                        {t(`host-template-assignments.${query.data.source}`)}
                    </Badge>
                    <Stack
                        gap={4}
                        style={{ maxHeight: 160, overflowY: 'auto', overflowWrap: 'anywhere' }}
                    >
                        {query.data.templates.map((item, index) => (
                            <Group
                                key={`${item.uuid}:${item.balancerTag ?? ''}:${index}`}
                                gap="xs"
                                wrap="wrap"
                            >
                                <Anchor
                                    component={Link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    size="sm"
                                    to={generatePath(ROUTES.DASHBOARD.TEMPLATES.TEMPLATE_EDITOR, {
                                        type: 'XRAY_JSON',
                                        uuid: item.uuid
                                    })}
                                >
                                    {item.name}
                                </Anchor>
                                {item.balancerTag && (
                                    <Text size="xs" ff="monospace">
                                        {item.balancerTag}
                                    </Text>
                                )}
                            </Group>
                        ))}
                    </Stack>
                    <Text size="xs" c="dimmed">
                        {t('host-template-assignments.help')}
                    </Text>
                </>
            ) : null}
        </Stack>
    )
}

import type { Change } from './autoselect-model'

import { Badge, Button, Code, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbCode } from 'react-icons/tb'

import styles from './autoselect-panel.module.css'

export function TemplateChanges({ changes }: { changes: Change[] }) {
    const { t } = useTranslation()
    const [all, setAll] = useState(false)
    return (
        <aside className={styles.preview} aria-label={t('autoselect.changes')}>
            <Paper withBorder p="md">
                <Group justify="space-between" mb="sm">
                    <Group gap="xs">
                        <TbCode aria-hidden size={18} />
                        <Title order={4}>{t('autoselect.changes')}</Title>
                    </Group>
                    <Badge variant="light">{changes.length}</Badge>
                </Group>
                <Text size="sm" c="dimmed" mb="md">
                    {t('autoselect.changes-help')}
                </Text>
                {!changes.length && <Text size="sm">{t('autoselect.no-changes')}</Text>}
                <Stack gap="md">
                    {changes.slice(0, all ? changes.length : 8).map((change) => (
                        <div key={change.path} className={styles.change}>
                            <Badge
                                color={
                                    change.kind === 'removed'
                                        ? 'red'
                                        : change.kind === 'changed'
                                          ? 'yellow'
                                          : 'teal'
                                }
                                variant="light"
                                mb="xs"
                            >
                                {t(`autoselect.change-${change.kind}`)}
                            </Badge>
                            <Text
                                size="xs"
                                ff="monospace"
                                dir="ltr"
                                mb="xs"
                                className={styles.path}
                            >
                                {change.path}
                            </Text>
                            <Code block dir="ltr" className={styles.snippet}>
                                {JSON.stringify(
                                    change.kind === 'removed' ? change.before : change.after,
                                    null,
                                    2
                                )?.slice(0, 12000)}
                            </Code>
                        </div>
                    ))}
                </Stack>
                {changes.length > 8 && (
                    <Button
                        mt="md"
                        variant="subtle"
                        fullWidth
                        onClick={() => setAll((value) => !value)}
                    >
                        {t(all ? 'autoselect.less-changes' : 'autoselect.all-changes')}
                    </Button>
                )}
            </Paper>
        </aside>
    )
}

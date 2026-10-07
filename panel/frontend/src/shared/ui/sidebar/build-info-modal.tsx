import {
    ActionIcon,
    Badge,
    Box,
    Button,
    CopyButton,
    Divider,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    Tooltip
} from '@mantine/core'
import { GetMetadataCommand } from '@remnawave/backend-contract'
import {
    TbBrandGithub,
    TbBrandTelegram,
    TbCalendar,
    TbCheck,
    TbCopy,
    TbGitBranch,
    TbHash,
    TbServer,
    TbWorld
} from 'react-icons/tb'

import { useUiText } from '@shared/i18n/interface-text'
import { formatTimeUtil } from '@shared/utils/time-utils'

import { CopyableCodeBlock } from '../copyable-code-block'
import { Logo } from '../logo'
import classes from './build-info-modal.module.css'

interface BuildInfoModalProps {
    isNewVersionAvailable: boolean
    remnawaveMetadata: GetMetadataCommand.Response['response']
}

export function BuildInfoModal({ remnawaveMetadata, isNewVersionAvailable }: BuildInfoModalProps) {
    const uiText = useUiText()

    return (
        <Stack gap="md">
            {isNewVersionAvailable && (
                <Paper className={classes.updateCard} p="md" radius="md">
                    <Group align="center" gap="md" wrap="wrap">
                        <Group gap="sm" wrap="nowrap">
                            <Box className={classes.updateIconBox}>
                                <Logo color="var(--mantine-color-teal-4)" size={24} />
                            </Box>
                            <Stack className={classes.updateTextWrapper} gap={4}>
                                <Text c="teal.4" fw={600} size="sm">
                                    {uiText('update-available-ff8b555')}
                                </Text>
                                <Text c="dimmed" size="xs">
                                    {uiText('a-new-version-is-available-e848cbe')}
                                </Text>
                            </Stack>
                        </Group>

                        <Button
                            color="teal"
                            component="a"
                            href="https://github.com/lottman/remnacust/releases"
                            leftSection={<TbBrandGithub size={14} />}
                            ml="auto"
                            radius="md"
                            size="xs"
                            target="_blank"
                            variant="light"
                        >
                            {uiText('check-out-326e405')}
                        </Button>
                    </Group>
                </Paper>
            )}

            <Paper className={classes.mainCard} p="md">
                <Stack gap="md">
                    <Group justify="space-between">
                        <Group gap="sm">
                            <Badge
                                color="cyan"
                                leftSection={<Logo size={16} />}
                                size="lg"
                                variant="light"
                            >
                                {remnawaveMetadata.version}
                            </Badge>

                            <Badge
                                color={
                                    remnawaveMetadata.git.backend.branch === 'dev' ? 'red' : 'teal'
                                }
                                leftSection={<TbGitBranch size={16} />}
                                size="lg"
                                variant="light"
                            >
                                {remnawaveMetadata.git.backend.branch}
                            </Badge>
                        </Group>
                        <CopyButton
                            timeout={2000}
                            value={JSON.stringify(remnawaveMetadata, null, 2)}
                        >
                            {({ copied, copy }) => (
                                <Tooltip label={uiText('copy-build-info-04f3631')}>
                                    <ActionIcon
                                        color={copied ? 'teal' : 'gray'}
                                        onClick={copy}
                                        size="md"
                                        variant="subtle"
                                    >
                                        {copied ? <TbCheck size={14} /> : <TbCopy size={14} />}
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </CopyButton>
                    </Group>

                    <Divider className={classes.divider} />

                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                        <Paper className={classes.buildTimeCard} p="sm" radius="md">
                            <Group gap="xs" mb={6}>
                                <TbCalendar color="var(--mantine-color-indigo-5)" size={14} />
                                <Text c="indigo.5" fw={600} size="xs" tt="uppercase">
                                    {uiText('build-time-707cae7')}
                                </Text>
                            </Group>
                            <Text c="var(--panel-text)" ff="monospace" size="xs">
                                {remnawaveMetadata.build.time
                                    ? formatTimeUtil({
                                          time: remnawaveMetadata.build.time,
                                          template: 'NUMERIC_DATETIME'
                                      })
                                    : '—'}
                            </Text>
                        </Paper>

                        <Paper className={classes.buildNumberCard} p="sm" radius="md">
                            <Group gap="xs" mb={6}>
                                <TbHash color="var(--mantine-color-violet-5)" size={14} />
                                <Text c="violet.5" fw={600} size="xs" tt="uppercase">
                                    {uiText('build-bdd254b')}
                                </Text>
                            </Group>
                            <Text c="var(--panel-text)" ff="monospace" size="xs">
                                {remnawaveMetadata.build.number}
                            </Text>
                        </Paper>
                    </SimpleGrid>
                </Stack>
            </Paper>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <Paper className={classes.backendCard} p="md" radius="md">
                    <Stack gap="sm">
                        <Group gap="xs" justify="space-between">
                            <Group gap="xs">
                                <TbServer color="var(--mantine-color-teal-5)" size={16} />
                                <Text c="teal.5" fw={600} size="sm">
                                    {uiText('backend-2fb4019')}
                                </Text>
                            </Group>
                            <Tooltip label={uiText('view-on-github-2067242')}>
                                <ActionIcon
                                    color="teal"
                                    component="a"
                                    href={remnawaveMetadata.git.backend.commitUrl}
                                    size="sm"
                                    target="_blank"
                                    variant="subtle"
                                >
                                    <TbBrandGithub size={14} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>

                        <CopyableCodeBlock
                            size="small"
                            value={remnawaveMetadata.git.backend.commitSha}
                        />
                    </Stack>
                </Paper>

                <Paper className={classes.frontendCard} p="md" radius="md">
                    <Stack gap="sm">
                        <Group gap="xs" justify="space-between">
                            <Group gap="xs">
                                <TbWorld color="var(--mantine-color-cyan-5)" size={16} />
                                <Text c="cyan.5" fw={600} size="sm">
                                    {uiText('frontend-af48bcf')}
                                </Text>
                            </Group>
                            <Tooltip label={uiText('view-on-github-2067242')}>
                                <ActionIcon
                                    color="cyan"
                                    component="a"
                                    href={remnawaveMetadata.git.frontend.commitUrl}
                                    size="sm"
                                    target="_blank"
                                    variant="subtle"
                                >
                                    <TbBrandGithub size={14} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>

                        <CopyableCodeBlock
                            size="small"
                            value={remnawaveMetadata.git.frontend.commitSha}
                        />
                    </Stack>
                </Paper>
            </SimpleGrid>

            <Group gap="sm" grow>
                <Button
                    color="cyan"
                    component="a"
                    href="https://t.me/lottman"
                    leftSection={<TbBrandTelegram size={16} />}
                    radius="md"
                    size="sm"
                    target="_blank"
                    variant="light"
                >
                    {uiText('community-bb501d7')}
                </Button>
                <Button
                    component="a"
                    href="https://github.com/lottman"
                    leftSection={<TbBrandGithub size={16} />}
                    radius="md"
                    size="sm"
                    target="_blank"
                    variant="default"
                >
                    GitHub
                </Button>
            </Group>
        </Stack>
    )
}

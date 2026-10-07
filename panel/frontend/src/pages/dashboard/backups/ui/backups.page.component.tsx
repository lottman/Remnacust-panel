import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Card,
    Group,
    Loader,
    NumberInput,
    Progress,
    Stack,
    Switch,
    TextInput,
    Text,
    Tooltip
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { UpdateBackupSettingsCommand } from '@remnawave/backend-contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiClockCountdown, PiPlus, PiTrash } from 'react-icons/pi'
import { TbBrandTelegram, TbDatabase, TbDownload, TbSend, TbLock } from 'react-icons/tb'
import { z } from 'zod'

import { instance } from '@shared/api/axios'
import {
    backupsQueryKeys,
    useDeleteBackup,
    useSendBackup,
    useUpdateBackupSettings
} from '@shared/api/hooks'
import { useUiText } from '@shared/i18n/interface-text'
import { PageHeaderShared } from '@shared/ui/page-header/page-header.shared'
import { SettingsCardShared } from '@shared/ui/settings-card'
import { formatTimeUtil } from '@shared/utils/time-utils/format-time.util'

interface IProps {
    onLock: () => void
    backups: Array<{ filename: string; sizeBytes: number; createdAt: Date }>
    settings: z.infer<typeof UpdateBackupSettingsCommand.ResponseSchema>['response']
}

const formatSize = (bytes: number): string => {
    if (bytes > 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
    return `${(bytes / 1024).toFixed(1)} KiB`
}

export const BackupsPageComponent = (props: IProps) => {
    const uiText = useUiText()

    const { backups, settings } = props
    const { i18n } = useTranslation()
    const queryClient = useQueryClient()
    const [isCreating, setIsCreating] = useState(false)
    const createPending = useRef(false)
    const downloadsInFlight = useRef(new Map<string, AbortController>())
    const [downloads, setDownloads] = useState<Record<string, { loaded: number; total?: number }>>(
        {}
    )
    useEffect(() => {
        const active = downloadsInFlight.current
        return () => {
            for (const controller of active.values()) controller.abort()
            active.clear()
        }
    }, [])
    const encryption = useQuery({
        queryKey: ['backups', 'encryption'],
        queryFn: async () => {
            const result = await instance.get<{
                response: { configured: boolean; legacyCount: number; automaticConfigured: boolean }
            }>('/api/backups/encryption')
            return result.data.response
        }
    })
    const canCreate = encryption.data?.configured === true
    const migrateLegacy = useMutation({
        mutationFn: async () => instance.post('/api/backups/encryption/migrate'),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['backups', 'encryption'] }),
                queryClient.invalidateQueries({ queryKey: backupsQueryKeys.getBackups.queryKey })
            ])
        },
        onError: () =>
            notifications.show({
                color: 'red',
                message: uiText('could-not-encrypt-legacy-backups-2ddd492')
            })
    })
    const createBackup = async () => {
        if (!canCreate || createPending.current) return
        createPending.current = true
        setIsCreating(true)
        try {
            await instance.post('/api/backups/create', {}, { timeout: 600_000 })
            await queryClient.invalidateQueries({ queryKey: backupsQueryKeys.getBackups.queryKey })
            notifications.show({
                color: 'teal',
                message: uiText('encrypted-zip-backup-created-d2fdf96')
            })
        } catch {
            notifications.show({
                color: 'red',
                message: uiText(
                    'could-not-create-backup-check-the-database-connection-and-avai-c5759c9'
                )
            })
        } finally {
            createPending.current = false
            setIsCreating(false)
        }
    }
    const downloadBackup = async (filename: string) => {
        if (downloadsInFlight.current.has(filename)) return
        const controller = new AbortController()
        downloadsInFlight.current.set(filename, controller)
        setDownloads((current) => ({ ...current, [filename]: { loaded: 0 } }))
        try {
            const response = await instance.get(
                `/api/backups/download/${encodeURIComponent(filename)}`,
                {
                    responseType: 'blob',
                    signal: controller.signal,
                    timeout: 1_800_000,
                    onDownloadProgress: ({ loaded, total }) => {
                        if (!controller.signal.aborted)
                            setDownloads((current) => ({
                                ...current,
                                [filename]: { loaded, total }
                            }))
                    }
                }
            )
            if (controller.signal.aborted) return
            const url = URL.createObjectURL(response.data)
            const link = document.createElement('a')
            link.href = url
            link.download = filename
            document.body.appendChild(link)
            link.click()
            link.remove()
            setTimeout(() => URL.revokeObjectURL(url), 60_000)
            notifications.show({
                color: 'teal',
                message: uiText('backup-handed-to-the-browser-for-saving-d68a198')
            })
        } catch {
            if (controller.signal.aborted) return
            notifications.show({
                color: 'red',
                message: uiText('could-not-download-backup-e909158')
            })
        } finally {
            downloadsInFlight.current.delete(filename)
            setDownloads((current) => {
                const next = { ...current }
                delete next[filename]
                return next
            })
        }
    }

    const form = useForm({
        name: 'backups-settings-form',
        mode: 'uncontrolled',
        initialValues: {
            intervalHours: settings.intervalHours,
            retentionDays: settings.retentionDays,
            sendToTelegram: settings.sendToTelegram,
            telegramBotToken: settings.telegramBotToken ?? '',
            telegramChatId: settings.telegramChatId ?? ''
        },
        validate: {
            intervalHours: (value) => Number.isInteger(value) && value >= 1 && value <= 168 ? null : '1–168',
            retentionDays: (value) => Number.isInteger(value) && value >= 1 && value <= 7 ? null : '1–7'
        }
    })

    const {
        mutate: deleteBackup,
        isPending: isDeleting,
        variables: deleteVariables
    } = useDeleteBackup({
        mutationFns: {
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: backupsQueryKeys.getBackups.queryKey
                })
            }
        }
    })
    const { mutate: sendBackup, isPending: isSending, variables: sendVariables } = useSendBackup({})
    const settingsMutation = {
        onSuccess: (updated: typeof settings) => {
            queryClient.setQueryData(backupsQueryKeys.getBackupSettings.queryKey, updated)
        }
    }
    const { mutate: updateSettings, isPending: isUpdating } = useUpdateBackupSettings({
        mutationFns: settingsMutation
    })
    const { mutate: updateSchedule, isPending: isUpdatingSchedule } = useUpdateBackupSettings({
        mutationFns: settingsMutation
    })

    return (
        <Stack gap="md">
            <PageHeaderShared
                title={uiText('backups-3334fee')}
                description={uiText(
                    'password-protected-zip-backups-of-the-panel-database-scheduled-32d6028'
                )}
                icon={<TbDatabase size={24} />}
                actions={
                    <Group gap="xs">
                        <Button
                            variant="default"
                            leftSection={<TbLock size={16} />}
                            onClick={props.onLock}
                        >
                            {uiText('lock-backups-2142035')}
                        </Button>
                        <Button
                            disabled={!canCreate}
                            leftSection={<PiPlus size={18} />}
                            loading={isCreating}
                            onClick={() => void createBackup()}
                            variant="soft"
                        >
                            {isCreating
                                ? uiText('creating-backup-6a9c2e3')
                                : uiText('create-zip-backup-8d2606e')}
                        </Button>
                    </Group>
                }
            />

            {isCreating && (
                <Alert color="cyan" role="status" icon={<Loader size={18} />}>
                    {uiText(
                        'creating-an-encrypted-zip-backup-the-file-will-appear-below-wh-bbda93b'
                    )}
                </Alert>
            )}
            {encryption.isError && (
                <Alert color="red" role="alert">
                    <Group justify="space-between">
                        <Text size="sm">
                            {uiText('could-not-check-backup-availability-930fb48')}
                        </Text>
                        <Button
                            size="xs"
                            variant="light"
                            loading={encryption.isFetching}
                            onClick={() => void encryption.refetch()}
                        >
                            {uiText('retry-942087c')}
                        </Button>
                    </Group>
                </Alert>
            )}

            {!!encryption.data?.legacyCount && (
                <SettingsCardShared.Container>
                    <SettingsCardShared.Header
                        title={uiText('legacy-backups-101ec81')}
                        description={uiText('convert-to-encrypted-zip-5e62e37')}
                        icon={<TbDatabase size={24} />}
                        iconColor="cyan"
                        iconVariant="soft"
                    />
                    <SettingsCardShared.Content>
                        <Stack gap="sm" maw={560}>
                            {!!encryption.data?.legacyCount && (
                                <Alert
                                    color="yellow"
                                    title={uiText('unencrypted-legacy-backups-exist-d767a2c')}
                                >
                                    <Stack gap="xs">
                                        <Text size="sm">
                                            {uiText(
                                                'count-value-these-files-can-be-converted-to-aes-zip-6d38585',
                                                { value1: encryption.data.legacyCount }
                                            )}
                                        </Text>
                                        {encryption.data.configured && (
                                            <Button
                                                loading={migrateLegacy.isPending}
                                                onClick={() => migrateLegacy.mutate()}
                                                size="xs"
                                                variant="light"
                                                w="fit-content"
                                            >
                                                {uiText('convert-to-aes-zip-3860f5e')}
                                            </Button>
                                        )}
                                    </Stack>
                                </Alert>
                            )}
                        </Stack>
                    </SettingsCardShared.Content>
                </SettingsCardShared.Container>
            )}

            <SettingsCardShared.Container>
                <SettingsCardShared.Header
                    description={uiText('periodic-database-dumps-and-telegram-delivery-84bd8f9')}
                    icon={<PiClockCountdown size={24} />}
                    iconColor="indigo"
                    iconVariant="soft"
                    title={uiText('automation-d909750')}
                />
                <SettingsCardShared.Content>
                    <form
                        onSubmit={form.onSubmit((values) => {
                            updateSettings({
                                variables: {
                                    intervalHours: values.intervalHours,
                                    retentionDays: values.retentionDays,
                                    sendToTelegram: values.sendToTelegram,
                                    telegramBotToken:
                                        values.telegramBotToken === ''
                                            ? null
                                            : values.telegramBotToken,
                                    telegramChatId:
                                        values.telegramChatId === '' ? null : values.telegramChatId
                                }
                            })
                        })}
                    >
                        <Stack gap="md" maw={520}>
                            <Switch
                                checked={settings.autoMode === 'DAILY'}
                                disabled={isUpdatingSchedule || isUpdating}
                                label={uiText('automatic-backups-20260929')}
                                onChange={(event) => {
                                    if (event.currentTarget.checked && form.validate().hasErrors) return
                                    updateSchedule({
                                        variables: {
                                            autoMode: event.currentTarget.checked ? 'DAILY' : 'OFF',
                                            intervalHours: form.getValues().intervalHours,
                                            retentionDays: form.getValues().retentionDays
                                        }
                                    })
                                }}
                            />
                            <NumberInput
                                key={form.key('intervalHours')}
                                label={uiText('interval-hours-e456194')}
                                min={1}
                                max={168}
                                allowDecimal={false}
                                {...form.getInputProps('intervalHours')}
                            />
                            <NumberInput
                                key={form.key('retentionDays')}
                                label={uiText('backup-retention-days-20260929')}
                                min={1}
                                max={7}
                                allowDecimal={false}
                                {...form.getInputProps('retentionDays')}
                            />
                            <Switch
                                key={form.key('sendToTelegram')}
                                label={uiText('send-to-telegram-4d932ac')}
                                {...form.getInputProps('sendToTelegram', { type: 'checkbox' })}
                            />
                            <Text c="dimmed" size="xs">
                                {uiText(
                                    'backups-are-retained-for-up-to-7-days-plain-dumps-are-addition-bdcd58a'
                                )}
                            </Text>
                            <TextInput
                                key={form.key('telegramBotToken')}
                                label={uiText('bot-token-5bb9aec')}
                                leftSection={<TbBrandTelegram size={16} />}
                                placeholder="123456:ABC-DEF..."
                                {...form.getInputProps('telegramBotToken')}
                            />
                            <TextInput
                                key={form.key('telegramChatId')}
                                label={uiText('chat-group-id-f310e38')}
                                leftSection={<TbBrandTelegram size={16} />}
                                placeholder="-1001234567890"
                                {...form.getInputProps('telegramChatId')}
                            />
                            <Button
                                disabled={isUpdatingSchedule}
                                loading={isUpdating}
                                type="submit"
                                variant="soft"
                                w="fit-content"
                            >
                                {uiText('save-settings-7f3a3b1')}
                            </Button>
                        </Stack>
                    </form>
                </SettingsCardShared.Content>
            </SettingsCardShared.Container>

            <Stack gap="xs">
                {backups.length === 0 && (
                    <Card c="dimmed" padding="lg" radius="md" withBorder>
                        {uiText('no-backups-yet-bb7381f')}
                    </Card>
                )}
                {backups.map((backup) => (
                    <Card key={backup.filename} padding="md" radius="md" withBorder>
                        <Group justify="space-between" wrap="wrap">
                            <Group
                                gap="sm"
                                wrap="nowrap"
                                style={{ minWidth: 0, flex: '1 1 240px' }}
                            >
                                <TbDatabase size={22} />
                                <Stack gap={0} style={{ minWidth: 0 }}>
                                    <Text fw={500} size="sm" style={{ overflowWrap: 'anywhere' }}>
                                        {backup.filename}
                                    </Text>
                                    <Group gap="xs">
                                        <Badge color="gray" size="xs" variant="light">
                                            {formatSize(backup.sizeBytes)}
                                        </Badge>
                                        <Badge
                                            color={
                                                backup.filename.endsWith('.dump.enc') ||
                                                backup.filename.endsWith('.zip')
                                                    ? 'teal'
                                                    : 'yellow'
                                            }
                                            size="xs"
                                            variant="light"
                                        >
                                            {backup.filename.endsWith('.dump.enc') ||
                                            backup.filename.endsWith('.zip')
                                                ? uiText('encrypted-f45aef6')
                                                : uiText('unencrypted-d5c2819')}
                                        </Badge>
                                        <Text c="dimmed" size="xs">
                                            {formatTimeUtil({
                                                time: backup.createdAt,
                                                template: 'FULL_DATETIME',
                                                language: i18n.language
                                            })}
                                        </Text>
                                    </Group>
                                </Stack>
                            </Group>
                            <Group gap="xs" wrap="nowrap">
                                <Tooltip label={uiText('download-backup-6692112')}>
                                    <ActionIcon
                                        aria-label={uiText('download-backup-6692112')}
                                        color="cyan"
                                        loading={!!downloads[backup.filename]}
                                        disabled={
                                            !backup.filename.endsWith('.dump.enc') &&
                                            !backup.filename.endsWith('.zip') &&
                                            !backup.filename.startsWith('manual-')
                                        }
                                        onClick={() => void downloadBackup(backup.filename)}
                                        size="lg"
                                        variant="soft"
                                    >
                                        <TbDownload size={18} />
                                    </ActionIcon>
                                </Tooltip>
                                <Tooltip label={uiText('send-to-telegram-4d932ac')}>
                                    <ActionIcon
                                        color="indigo"
                                        aria-label={uiText('send-to-telegram-4d932ac')}
                                        loading={
                                            isSending &&
                                            sendVariables?.variables?.filename === backup.filename
                                        }
                                        disabled={
                                            isSending ||
                                            (!backup.filename.endsWith('.dump.enc') &&
                                                !backup.filename.endsWith('.zip'))
                                        }
                                        onClick={() =>
                                            sendBackup({ variables: { filename: backup.filename } })
                                        }
                                        size="lg"
                                        variant="soft"
                                    >
                                        <TbSend size={18} />
                                    </ActionIcon>
                                </Tooltip>
                                <Tooltip label={uiText('delete-e2d0a54')}>
                                    <ActionIcon
                                        color="red"
                                        aria-label={uiText('delete-backup-86cf366')}
                                        loading={
                                            isDeleting &&
                                            deleteVariables?.variables?.filename === backup.filename
                                        }
                                        disabled={isDeleting || !!downloads[backup.filename]}
                                        onClick={() =>
                                            deleteBackup({
                                                variables: { filename: backup.filename }
                                            })
                                        }
                                        size="lg"
                                        variant="soft"
                                    >
                                        <PiTrash size={18} />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        </Group>
                        {downloads[backup.filename] && (
                            <Stack gap={4} mt="sm" role="status" aria-live="polite">
                                <Text size="xs" c="dimmed">
                                    {uiText('downloading-37b3455')} ·{' '}
                                    {formatSize(downloads[backup.filename].loaded)}
                                    {!!downloads[backup.filename].total &&
                                        ` / ${formatSize(downloads[backup.filename].total!)}`}
                                </Text>
                                <Progress
                                    aria-label={uiText('download-progress-984b84c')}
                                    size="xs"
                                    radius="xl"
                                    value={
                                        downloads[backup.filename].total
                                            ? Math.min(
                                                  100,
                                                  (downloads[backup.filename].loaded /
                                                      downloads[backup.filename].total!) *
                                                      100
                                              )
                                            : 100
                                    }
                                    animated={!downloads[backup.filename].total}
                                    striped={!downloads[backup.filename].total}
                                />
                            </Stack>
                        )}
                    </Card>
                ))}
            </Stack>
        </Stack>
    )
}

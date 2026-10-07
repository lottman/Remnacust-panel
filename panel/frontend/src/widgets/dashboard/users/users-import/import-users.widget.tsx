import { FileInput, Group, Loader, Select, Stack, Switch, Text, Alert, Button } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { ImportUsersCommand } from '@remnawave/backend-contract'
import { useState } from 'react'
import { TbAlertCircle, TbUpload } from 'react-icons/tb'

import { useGetInternalSquads, useImportUsers } from '@shared/api/hooks'
import { useUiText } from '@shared/i18n/interface-text'

import { prepareImportUsers } from './prepare-import-users'

type ExportedFile = {
    users?: Array<Record<string, unknown>>
}

export const ImportUsersModalWidget = (props: {
    onFinished?: () => void
    defaultSquadUuid?: string
    lockedSquad?: boolean
}) => {
    const uiText = useUiText()

    const { onFinished, defaultSquadUuid, lockedSquad } = props

    const { data: squads, isLoading: isSquadsLoading } = useGetInternalSquads({})

    const form = useForm({
        name: 'import-users-form',
        mode: 'uncontrolled',
        initialValues: {
            defaultSquadUuid: defaultSquadUuid ?? null,
            keepSquads: true
        }
    })

    const [fileContent, setFileContent] = useState<ExportedFile | null>(null)

    const { mutate: importUsers, isPending } = useImportUsers({
        mutationFns: {
            onSuccess: (data) => {
                notifications.show({
                    title: uiText('import-finished-2194340'),
                    message: uiText('created-value-skipped-value-failed-value-2a9f657', {
                        value1: data.created,
                        value2: data.skipped,
                        value3: data.failed
                    }),
                    color: data.failed > 0 ? 'orange' : 'teal'
                })
                setFileContent(null)
                onFinished?.()
            }
        }
    })

    const squadOptions = (squads?.internalSquads ?? []).map((squad) => ({
        value: squad.uuid,
        label: squad.name
    }))

    const readFile = async (file: File | null) => {
        if (!file) {
            setFileContent(null)
            return
        }
        try {
            const text = await file.text()
            const parsed = JSON.parse(text) as ExportedFile
            if (!Array.isArray(parsed.users) || parsed.users.length === 0) {
                throw new Error(uiText('no-users-array-in-file-f80eb52'))
            }
            if (parsed.users.length > 20000) {
                throw new Error(uiText('too-many-users-max-20000-b30882c'))
            }
            setFileContent(parsed)
        } catch (error) {
            notifications.show({
                title: uiText('file-error-98f5369'),
                message: error instanceof Error ? error.message : 'Unknown error',
                color: 'red'
            })
            setFileContent(null)
        }
    }

    const runImport = () => {
        if (!fileContent?.users) return
        const { keepSquads, defaultSquadUuid: selectedSquad } = form.getValues()
        importUsers({
            variables: {
                users: prepareImportUsers(
                    fileContent.users,
                    keepSquads
                ) as ImportUsersCommand.RequestBody['users'],
                defaultInternalSquadUuid: selectedSquad
            }
        })
    }

    return (
        <Stack gap="md">
            <Alert color="indigo" icon={<TbAlertCircle size={16} />} variant="light">
                {uiText('upload-a-json-file-exported-from-remnawave-xera-subscription-s-180157a')}
            </Alert>

            <FileInput
                accept=".json,application/json"
                label={uiText('export-file-d9d979c')}
                leftSection={<TbUpload size={16} />}
                onChange={readFile}
                placeholder="users-export.json"
            />

            <Switch
                key={form.key('keepSquads')}
                label={uiText('restore-internal-squads-by-name-3fa079a')}
                description={uiText('squads-missing-in-this-panel-are-skipped-8999934')}
                {...form.getInputProps('keepSquads', { type: 'checkbox' })}
            />

            <Select
                allowDeselect={!lockedSquad}
                clearable={!lockedSquad}
                data={squadOptions}
                disabled={isSquadsLoading || !!lockedSquad}
                key={form.key('defaultSquadUuid')}
                label={uiText('add-everyone-to-a-squad-fallback-7a2f868')}
                leftSection={isSquadsLoading ? <Loader size="xs" /> : undefined}
                {...form.getInputProps('defaultSquadUuid')}
            />

            <Group justify="space-between">
                <Text c="dimmed" size="xs">
                    {fileContent?.users
                        ? uiText('users-in-file-value-182a30f', {
                              value1: fileContent.users.length
                          })
                        : ''}
                </Text>
                <Button
                    disabled={!fileContent?.users}
                    leftSection={<TbUpload size={16} />}
                    loading={isPending}
                    onClick={runImport}
                    variant="soft"
                >
                    {uiText('import-2cff9ba')}
                </Button>
            </Group>
        </Stack>
    )
}

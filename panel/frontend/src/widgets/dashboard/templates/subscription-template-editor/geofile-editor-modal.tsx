import type { Geofile, GeofileContent, GeofileRecordType, GeofileSelection } from './geofile-types'

import {
    ActionIcon,
    Alert,
    Autocomplete,
    Badge,
    Button,
    FileInput,
    Group,
    Loader,
    Modal,
    Pagination,
    Select,
    Stack,
    Text,
    Textarea,
    TextInput
} from '@mantine/core'
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbArrowBackUp, TbTrash } from 'react-icons/tb'

import { instance } from '@shared/api'

import styles from './autoselect-panel.module.css'
import { geofileRecordPatch, type GeofileRecordChange } from './geofile-edit-model'
import { geofilePresets } from './geofile-presets'

export function GeofileEditorModal({
    file,
    onClose,
    onSaved,
    getCopySelections
}: {
    file: Geofile
    onClose: () => void
    onSaved: (file: Geofile, sourceId: string, selections: GeofileSelection[]) => Promise<void>
    getCopySelections: () => GeofileSelection[]
}) {
    const { t } = useTranslation()
    const [opened, setOpened] = useState(true)
    const mobile = useMediaQuery('(max-width: 48em)')
    const copy =
        file.editPolicy === 'copy' ||
        (file.origin !== 'copy' &&
            geofilePresets.some((preset) => preset.url === file.refresh?.sourceUrl))
    const dat = file.kind === 'geoip' || file.kind === 'geosite'
    const [name, setName] = useState('')
    const [category, setCategory] = useState(file.categories?.[0] ?? '')
    const [categoryInput, setCategoryInput] = useState(file.categories?.[0] ?? '')
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [debouncedSearch] = useDebouncedValue(search, 300)
    const [baseline, setBaseline] = useState<{ sha256: string; text: string } | null>(null)
    const [text, setText] = useState('')
    const [changes, setChanges] = useState<Record<number, GeofileRecordChange>>({})
    const [additions, setAdditions] = useState('')
    const [replacement, setReplacement] = useState<File | null>(null)
    const query = useQuery({
        queryKey: ['geofile-content', file.id, category, page, debouncedSearch],
        queryFn: async ({ signal }) =>
            (
                await instance.get<{ response: GeofileContent }>(
                    `/api/geofiles/${file.id}/content`,
                    {
                        params: {
                            ...(category ? { category } : {}),
                            page,
                            limit: 100,
                            search: debouncedSearch
                        },
                        signal,
                        timeout: 45_000
                    }
                )
            ).data.response,
        staleTime: 0,
        retry: false,
        refetchOnWindowFocus: false
    })
    if (query.data && !baseline && !query.isFetching) {
        const initial = query.data.text ?? ''
        setBaseline({ sha256: query.data.file.sha256, text: initial })
        setText(initial)
    }
    const dirtyRecords = Object.keys(changes).length > 0 || additions.trim().length > 0
    const dirty =
        dirtyRecords ||
        (text !== baseline?.text && baseline !== null) ||
        replacement !== null ||
        name.trim().length > 0
    const conflict = !!baseline && !!query.data && baseline.sha256 !== query.data.file.sha256
    const selectCategory = (value: string) => {
        if (value && !dirtyRecords) {
            setCategoryInput(value)
            setCategory(value)
            setPage(1)
            setSearch('')
        }
    }
    const save = useMutation({
        mutationFn: async () => {
            if (!baseline || conflict || (copy && !name.trim())) throw Error('geofile-edit')
            const selections = copy ? getCopySelections() : []
            if (replacement) {
                if (!replacement.size || replacement.size > 64 * 1024 * 1024)
                    throw Error('geofile-edit')
                const options = {
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'If-Match': `"${baseline.sha256}"`
                    },
                    timeout: 45_000
                }
                const copyData = new FormData()
                if (copy) {
                    copyData.append('metadata', JSON.stringify({ name: name.trim(), selections }))
                    copyData.append('file', replacement)
                }
                const result = (
                    copy
                        ? await instance.post<{ response: Geofile }>(
                              `/api/geofiles/${file.id}/copy-data`,
                              copyData,
                              {
                                  ...options,
                                  headers: { ...options.headers, 'Content-Type': undefined }
                              }
                          )
                        : await instance.put<{ response: Geofile }>(
                              `/api/geofiles/${file.id}/data`,
                              replacement,
                              options
                          )
                ).data.response
                return { file: result, selections }
            }
            const patch = geofileRecordPatch(changes, additions, file.kind)
            if (
                new TextEncoder().encode(text).length >
                (query.data?.maxTextBytes ?? 8 * 1024 * 1024)
            )
                throw Error('geofile-edit')
            const body = {
                sha256: baseline.sha256,
                ...(copy ? { name: name.trim(), selections } : {}),
                ...(dat ? { category, ...patch } : { text })
            }
            const result = (
                copy
                    ? await instance.post<{ response: Geofile }>(
                          `/api/geofiles/${file.id}/copy`,
                          body,
                          { timeout: 45_000 }
                      )
                    : await instance.patch<{ response: Geofile }>(
                          `/api/geofiles/${file.id}/content`,
                          body,
                          { timeout: 45_000 }
                      )
            ).data.response
            return { file: result, selections }
        },
        onSuccess: async (result) => {
            await onSaved(result.file, file.id, result.selections)
            setOpened(false)
        }
    })
    const close = () => {
        if (save.isPending) return
        if (!dirty) {
            setOpened(false)
            return
        }
        modals.openConfirmModal({
            title: t('geofiles.editor-discard-title'),
            children: <Text size="sm">{t('geofiles.editor-discard-help')}</Text>,
            labels: { confirm: t('geofiles.discard-changes'), cancel: t('common.action.cancel') },
            onConfirm: () => setOpened(false)
        })
    }
    const errorCode = isAxiosError(save.error) ? save.error.response?.data?.message : null
    const errorKey =
        save.error instanceof Error && save.error.message === 'geofile-edit-batch'
            ? 'geofiles.editor-batch-limit'
            : errorCode === 'geofile-name-exists'
              ? 'geofiles.editor-name-exists'
              : errorCode === 'geofile-stale' ||
                  errorCode === 'geofile-references-changed' ||
                  conflict
                ? 'geofiles.editor-conflict'
                : 'geofiles.editor-save-failed'
    return (
        <Modal
            opened={opened}
            onExitTransitionEnd={onClose}
            onClose={close}
            title={t('geofiles.editor-title', { name: file.name })}
            size="xl"
            fullScreen={mobile}
            closeOnClickOutside={false}
            closeButtonProps={{ disabled: save.isPending, 'aria-label': t('common.action.close') }}
        >
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    {t(copy ? 'geofiles.editor-copy-help' : 'geofiles.editor-shared-help')}
                </Text>
                {copy && (
                    <TextInput
                        label={t('geofiles.editor-copy-name')}
                        value={name}
                        maxLength={128}
                        disabled={save.isPending}
                        onChange={(event) => setName(event.currentTarget.value)}
                        required
                    />
                )}
                {query.isPending && <Loader size="sm" />}
                {query.isError && (
                    <Alert color="red">
                        <Group justify="space-between">
                            <Text size="sm">{t('geofiles.editor-load-failed')}</Text>
                            <Button variant="subtle" onClick={() => void query.refetch()}>
                                {t('common.action.refresh')}
                            </Button>
                        </Group>
                    </Alert>
                )}
                {(conflict || save.isError) && (
                    <Alert color="red" role="alert">
                        {t(errorKey)}
                    </Alert>
                )}
                {query.data && (
                    <>
                        {dat && (
                            <>
                                <div className={styles.fields}>
                                    <Autocomplete
                                        label={t('geofiles.editor-category')}
                                        data={[
                                            ...new Set([
                                                ...(query.data.file.categories ?? []),
                                                category
                                            ])
                                        ].filter(Boolean)}
                                        value={categoryInput}
                                        maxLength={128}
                                        disabled={dirtyRecords || save.isPending || !!replacement}
                                        onChange={setCategoryInput}
                                        onOptionSubmit={selectCategory}
                                        onBlur={() => selectCategory(categoryInput.trim())}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                event.preventDefault()
                                                selectCategory(categoryInput.trim())
                                            }
                                        }}
                                    />
                                    <TextInput
                                        label={t('geofiles.editor-search')}
                                        value={search}
                                        disabled={save.isPending}
                                        onChange={(event) => {
                                            setSearch(event.currentTarget.value)
                                            setPage(1)
                                        }}
                                    />
                                </div>
                                {!replacement && (
                                    <>
                                        <Text size="xs" c="dimmed">
                                            {t('geofiles.address-count', {
                                                count: query.data.total ?? 0
                                            })}
                                        </Text>
                                        {!query.data.records.length && (
                                            <Text size="sm" c="dimmed">
                                                {t('common.message.nothing-found')}
                                            </Text>
                                        )}
                                        {query.data.records.map((record) => {
                                            const change = changes[record.index] ?? record
                                            return (
                                                <Group
                                                    key={record.index}
                                                    gap="xs"
                                                    align="flex-start"
                                                    wrap="nowrap"
                                                >
                                                    {file.kind === 'geosite' && (
                                                        <Select
                                                            aria-label={t(
                                                                'geofiles.editor-record-type'
                                                            )}
                                                            w={mobile ? 90 : 118}
                                                            miw={90}
                                                            data={[
                                                                'domain',
                                                                'full',
                                                                'keyword',
                                                                'regexp'
                                                            ]}
                                                            value={change.type}
                                                            allowDeselect={false}
                                                            disabled={
                                                                save.isPending || !!change.remove
                                                            }
                                                            onChange={(value) =>
                                                                value &&
                                                                setChanges((previous) => ({
                                                                    ...previous,
                                                                    [record.index]: {
                                                                        ...change,
                                                                        type: value as GeofileRecordType
                                                                    }
                                                                }))
                                                            }
                                                        />
                                                    )}
                                                    <Stack gap={3} style={{ flex: 1, minWidth: 0 }}>
                                                        <TextInput
                                                            aria-label={t('geofiles.addresses')}
                                                            value={change.value}
                                                            maxLength={4096}
                                                            disabled={
                                                                save.isPending || !!change.remove
                                                            }
                                                            dir="ltr"
                                                            spellCheck={false}
                                                            onChange={(event) => {
                                                                const value =
                                                                    event.currentTarget.value
                                                                setChanges((previous) => ({
                                                                    ...previous,
                                                                    [record.index]: {
                                                                        ...change,
                                                                        value
                                                                    }
                                                                }))
                                                            }}
                                                        />
                                                        {!!record.attributeCount && (
                                                            <Badge size="xs" variant="light">
                                                                {t('geofiles.editor-attributes', {
                                                                    count: record.attributeCount
                                                                })}
                                                            </Badge>
                                                        )}
                                                    </Stack>
                                                    <ActionIcon
                                                        size="input-sm"
                                                        variant="subtle"
                                                        color={change.remove ? undefined : 'red'}
                                                        disabled={save.isPending}
                                                        aria-label={t(
                                                            change.remove
                                                                ? 'geofiles.editor-restore-record'
                                                                : 'common.action.delete'
                                                        )}
                                                        onClick={() =>
                                                            setChanges((previous) => ({
                                                                ...previous,
                                                                [record.index]: {
                                                                    ...change,
                                                                    remove: !change.remove
                                                                }
                                                            }))
                                                        }
                                                    >
                                                        {change.remove ? (
                                                            <TbArrowBackUp size={16} />
                                                        ) : (
                                                            <TbTrash size={16} />
                                                        )}
                                                    </ActionIcon>
                                                </Group>
                                            )
                                        })}
                                        {(query.data.total ?? 0) > 100 && (
                                            <Pagination
                                                size="sm"
                                                total={Math.ceil((query.data.total ?? 0) / 100)}
                                                value={page}
                                                onChange={setPage}
                                                siblings={0}
                                                disabled={save.isPending}
                                            />
                                        )}
                                        <Textarea
                                            label={t('geofiles.editor-add-addresses')}
                                            description={t(
                                                file.kind === 'geoip'
                                                    ? 'geofiles.editor-add-ip-help'
                                                    : 'geofiles.editor-add-domain-help'
                                            )}
                                            value={additions}
                                            onChange={(event) =>
                                                setAdditions(event.currentTarget.value)
                                            }
                                            autosize
                                            minRows={3}
                                            maxRows={10}
                                            maxLength={2 * 1024 * 1024}
                                            disabled={save.isPending}
                                            spellCheck={false}
                                            dir="ltr"
                                        />
                                    </>
                                )}
                            </>
                        )}
                        {query.data.mode === 'text' && !replacement && (
                            <Textarea
                                label={t('geofiles.editor-content')}
                                value={text}
                                onChange={(event) => setText(event.currentTarget.value)}
                                autosize
                                minRows={12}
                                maxRows={25}
                                maxLength={query.data.maxTextBytes ?? 8 * 1024 * 1024}
                                disabled={save.isPending}
                                spellCheck={false}
                                dir="ltr"
                            />
                        )}
                        {query.data.mode === 'binary' && (
                            <Text size="sm" c="dimmed">
                                {t('geofiles.editor-binary-help')}
                            </Text>
                        )}
                        <FileInput
                            label={t('geofiles.editor-replace-file')}
                            description={t('geofiles.editor-replace-help')}
                            placeholder={t('geofiles.click-to-upload')}
                            value={replacement}
                            clearable
                            disabled={
                                save.isPending ||
                                dirtyRecords ||
                                (baseline !== null && text !== baseline.text)
                            }
                            onChange={setReplacement}
                        />
                        <Group justify="flex-end">
                            <Button variant="default" disabled={save.isPending} onClick={close}>
                                {t('common.action.cancel')}
                            </Button>
                            <Button
                                loading={save.isPending}
                                disabled={
                                    !baseline ||
                                    conflict ||
                                    (dat && categoryInput.trim() !== category) ||
                                    query.isFetching ||
                                    (copy && !name.trim()) ||
                                    (!copy && !dirty) ||
                                    (query.data.mode === 'binary' && !replacement)
                                }
                                onClick={() => save.mutate()}
                            >
                                {t(copy ? 'geofiles.editor-save-copy' : 'common.action.save')}
                            </Button>
                        </Group>
                    </>
                )}
            </Stack>
        </Modal>
    )
}

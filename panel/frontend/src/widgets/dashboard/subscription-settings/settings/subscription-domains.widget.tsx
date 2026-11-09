import {
    Accordion,
    ActionIcon,
    Alert,
    Badge,
    Button,
    CopyButton,
    Group,
    Modal,
    Select,
    Stack,
    Switch,
    Table,
    Text,
    TextInput,
    Tooltip,
    Loader
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { MAX_CDN_PER_PRIMARY } from '@remnawave/backend-contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbCheck, TbCopy, TbEdit, TbPlus, TbTrash, TbWorld, TbLink } from 'react-icons/tb'

import { instance } from '@shared/api/axios'
import { SectionCard } from '@shared/ui/section-card'
import { SettingsCardShared } from '@shared/ui/settings-card'

import { cdnSubscriptionLink } from './subscription-domain-link'

type DomainKind = 'PRIMARY' | 'CDN'
type DomainEnvironmentStatus = 'synced' | 'unavailable' | 'invalid' | 'conflict'
type SubscriptionDomain = {
    uuid: string
    name: string
    domain: string
    path: string
    kind: DomainKind
    parentUuid: string | null
    isDefault: boolean
    accessMode: 'OPEN' | 'CDN_ONLY' | 'REDIRECT' | 'BLOCKED'
    redirectDomainUuid: string | null
    usersCount: number
    aliasesCount: number
    publicBaseUrl: string
    requestHeaderName: string | null
}

type DomainForm = {
    name: string
    domain: string
    path: string
    kind: DomainKind
    parentUuid: string | null
    isDefault: boolean
    accessMode: 'OPEN' | 'CDN_ONLY' | 'REDIRECT' | 'BLOCKED'
    redirectDomainUuid: string | null
}

const queryKey = ['subscription-domains'] as const

const emptyForm: DomainForm = {
    name: '',
    domain: '',
    path: '',
    kind: 'PRIMARY',
    parentUuid: null,
    isDefault: false,
    accessMode: 'OPEN',
    redirectDomainUuid: null
}

export function SubscriptionDomainsWidget() {
    const { t } = useTranslation()
    const cache = useQueryClient()
    const [opened, setOpened] = useState(false)
    const [editing, setEditing] = useState<SubscriptionDomain | null>(null)
    const [setupDomain, setSetupDomain] = useState<SubscriptionDomain | null>(null)
    const [existingLink, setExistingLink] = useState('')
    const [removeTarget, setRemoveTarget] = useState<SubscriptionDomain | null>(null)
    const form = useForm<DomainForm>({ initialValues: emptyForm })
    const domains = useQuery({
        queryKey,
        queryFn: async () =>
            (
                await instance.get<{
                    response: SubscriptionDomain[]
                    environment?: DomainEnvironmentStatus
                }>('/api/subscription-domains')
            ).data,
        staleTime: 15_000,
        refetchOnWindowFocus: 'always'
    })
    const credentials = useQuery({
        queryKey: ['subscription-domain-credentials', setupDomain?.uuid],
        enabled: !!setupDomain,
        gcTime: 0,
        staleTime: 0,
        retry: false,
        queryFn: async () =>
            (
                await instance.post<{
                    response: { requestHeaderName: string; requestHeaderValue: string }
                }>(`/api/subscription-domains/${setupDomain!.uuid}/credentials`)
            ).data.response
    })
    const save = useMutation({
        mutationFn: async (values: DomainForm) => {
            const data = {
                ...values,
                parentUuid: values.kind === 'CDN' ? values.parentUuid : null,
                isDefault: values.kind === 'PRIMARY' && values.isDefault,
                accessMode: values.accessMode,
                redirectDomainUuid:
                    values.kind === 'PRIMARY' && values.accessMode === 'REDIRECT'
                        ? values.redirectDomainUuid
                        : null
            }
            if (editing) {
                return instance.patch(`/api/subscription-domains/${editing.uuid}`, data)
            }
            return instance.post('/api/subscription-domains', data)
        },
        onSuccess: () => {
            void cache.invalidateQueries({ queryKey })
            void cache.invalidateQueries({ queryKey: ['user-domain-links'] })
            setOpened(false)
        }
    })
    const remove = useMutation({
        mutationFn: async (domain: SubscriptionDomain) =>
            instance.delete(`/api/subscription-domains/${domain.uuid}`, {
                params: domain.usersCount > 0 ? { reassignUsers: 'true' } : undefined
            }),
        onSuccess: () => {
            void cache.invalidateQueries({ queryKey })
            void cache.invalidateQueries({ queryKey: ['user-domain-links'] })
            setRemoveTarget(null)
        }
    })

    const openCreate = () => {
        setEditing(null)
        form.setValues(emptyForm)
        setOpened(true)
    }
    const openEdit = (domain: SubscriptionDomain) => {
        setEditing(domain)
        form.setValues({
            name: domain.name,
            domain: domain.domain,
            path: domain.path,
            kind: domain.kind,
            parentUuid: domain.parentUuid,
            isDefault: domain.isDefault,
            accessMode: domain.accessMode ?? 'OPEN',
            redirectDomainUuid: domain.redirectDomainUuid ?? null
        })
        setOpened(true)
    }
    const rows = domains.data?.response ?? []
    const primaryDomains = rows.filter((domain) => domain.kind === 'PRIMARY')
    const convertedLink = setupDomain
        ? cdnSubscriptionLink(setupDomain.publicBaseUrl, existingLink)
        : null
    const copyableField = (label: string, value: string, secret = false) => (
        <TextInput
            readOnly
            type={secret ? 'password' : 'text'}
            autoComplete="off"
            dir="ltr"
            label={label}
            value={value}
            rightSection={
                <CopyButton value={value}>
                    {({ copied, copy }) => (
                        <ActionIcon
                            onClick={copy}
                            variant="subtle"
                            aria-label={t('common.action.copy')}
                        >
                            {copied ? <TbCheck size={16} /> : <TbCopy size={16} />}
                        </ActionIcon>
                    )}
                </CopyButton>
            }
        />
    )
    const environmentError =
        isAxiosError(save.error) &&
        ['SUBSCRIPTION_DOMAIN_ENV_UNAVAILABLE', 'SUBSCRIPTION_DOMAIN_ENV_CHANGED'].includes(
            save.error.response?.data?.errorCode
        )
    const lastPrimaryError =
        isAxiosError(save.error) &&
        [save.error.response?.data?.errorCode, save.error.response?.data?.message].includes(
            'SUBSCRIPTION_DOMAIN_LAST_PRIMARY'
        )
    const cdnLimitError =
        isAxiosError(save.error) &&
        [
            save.error.response?.data?.errorCode,
            save.error.response?.data?.code,
            save.error.response?.data?.message
        ].includes('SUBSCRIPTION_DOMAIN_CDN_LIMIT')

    return (
        <>
            <SectionCard.Root>
                <SectionCard.Section>
                    <Stack gap="sm">
                        <SettingsCardShared.Header
                            title={t('subscription-domains.title')}
                            description={t('subscription-domains.help')}
                            icon={<TbWorld size={24} />}
                            actions={
                                <Button leftSection={<TbPlus size={16} />} onClick={openCreate}>
                                    {t('subscription-domains.add')}
                                </Button>
                            }
                        />
                        {domains.isLoading && (
                            <Loader aria-label={t('subscription-domains.loading')} />
                        )}
                        {domains.data?.environment && (
                            <Text
                                size="sm"
                                c={domains.data.environment === 'synced' ? 'dimmed' : 'yellow'}
                            >
                                {t(`subscription-domains.environment-${domains.data.environment}`)}
                            </Text>
                        )}
                        {domains.isError && (
                            <Alert color="red">{t('subscription-domains.load-failed')}</Alert>
                        )}
                        {domains.isSuccess && !rows.length && (
                            <Alert color="blue">{t('subscription-domains.empty')}</Alert>
                        )}
                        {!!rows.length && (
                            <Table.ScrollContainer minWidth={720}>
                                <Table verticalSpacing="sm">
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>{t('subscription-domains.domain')}</Table.Th>
                                            <Table.Th>{t('subscription-domains.type')}</Table.Th>
                                            <Table.Th>{t('subscription-domains.uuid')}</Table.Th>
                                            <Table.Th>{t('subscription-domains.usage')}</Table.Th>
                                            <Table.Th />
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {rows.map((domain) => {
                                            const parent = rows.find(
                                                (item) => item.uuid === domain.parentUuid
                                            )
                                            const lastPrimary =
                                                domain.kind === 'PRIMARY' &&
                                                domain.accessMode !== 'BLOCKED' &&
                                                !rows.some(
                                                    (row) =>
                                                        row.kind === 'PRIMARY' &&
                                                        row.uuid !== domain.uuid &&
                                                        row.accessMode !== 'BLOCKED'
                                                )
                                            const inUse =
                                                domain.isDefault ||
                                                lastPrimary ||
                                                (domain.usersCount > 0 &&
                                                    !rows.some(
                                                        (row) =>
                                                            row.isDefault &&
                                                            row.uuid !== domain.uuid
                                                    )) ||
                                                domain.aliasesCount > 0
                                            return (
                                                <Table.Tr key={domain.uuid}>
                                                    <Table.Td>
                                                        <Stack gap={2}>
                                                            <Text fw={500}>{domain.name}</Text>
                                                            <Text ff="monospace" size="xs">
                                                                {domain.domain}
                                                                {domain.path || '/'}
                                                            </Text>
                                                            {domain.kind === 'CDN' && (
                                                                <Button
                                                                    variant="subtle"
                                                                    size="compact-xs"
                                                                    w="fit-content"
                                                                    leftSection={
                                                                        <TbLink size={14} />
                                                                    }
                                                                    onClick={() => {
                                                                        setExistingLink('')
                                                                        setSetupDomain(domain)
                                                                    }}
                                                                >
                                                                    {t(
                                                                        'subscription-domains.setup'
                                                                    )}
                                                                </Button>
                                                            )}
                                                        </Stack>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Stack gap={4} align="flex-start">
                                                            <Badge
                                                                color={
                                                                    domain.kind === 'PRIMARY'
                                                                        ? 'teal'
                                                                        : 'blue'
                                                                }
                                                            >
                                                                {t(
                                                                    domain.kind === 'PRIMARY'
                                                                        ? 'subscription-domains.kind-primary'
                                                                        : 'subscription-domains.kind-cdn'
                                                                )}
                                                            </Badge>
                                                            {domain.isDefault && (
                                                                <Badge color="cyan" variant="light">
                                                                    {t(
                                                                        'subscription-domains.default'
                                                                    )}
                                                                </Badge>
                                                            )}
                                                            {(domain.accessMode === 'BLOCKED' ||
                                                                parent?.accessMode ===
                                                                    'BLOCKED') && (
                                                                <Badge color="red" variant="light">
                                                                    {t(
                                                                        'subscription-domains.access-BLOCKED'
                                                                    )}
                                                                </Badge>
                                                            )}
                                                            {parent && (
                                                                <Text c="dimmed" size="xs">
                                                                    {t(
                                                                        'subscription-domains.cdn-for',
                                                                        {
                                                                            domain: parent.domain
                                                                        }
                                                                    )}
                                                                </Text>
                                                            )}
                                                        </Stack>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Group gap={4} wrap="nowrap">
                                                            <Text ff="monospace" size="xs">
                                                                {domain.uuid}
                                                            </Text>
                                                            <CopyButton
                                                                value={domain.uuid}
                                                                timeout={1200}
                                                            >
                                                                {({ copied, copy }) => (
                                                                    <Tooltip
                                                                        label={
                                                                            copied
                                                                                ? t(
                                                                                      'common.message.copied'
                                                                                  )
                                                                                : t(
                                                                                      'common.action.copy'
                                                                                  )
                                                                        }
                                                                    >
                                                                        <ActionIcon
                                                                            aria-label={t(
                                                                                'common.action.copy'
                                                                            )}
                                                                            color={
                                                                                copied
                                                                                    ? 'teal'
                                                                                    : 'gray'
                                                                            }
                                                                            onClick={copy}
                                                                            variant="subtle"
                                                                        >
                                                                            {copied ? (
                                                                                <TbCheck
                                                                                    size={15}
                                                                                />
                                                                            ) : (
                                                                                <TbCopy size={15} />
                                                                            )}
                                                                        </ActionIcon>
                                                                    </Tooltip>
                                                                )}
                                                            </CopyButton>
                                                        </Group>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text size="sm">
                                                            {t('subscription-domains.users', {
                                                                count: domain.usersCount
                                                            })}
                                                            {domain.aliasesCount > 0 &&
                                                                ` · ${t(
                                                                    'subscription-domains.aliases',
                                                                    {
                                                                        count: domain.aliasesCount
                                                                    }
                                                                )}`}
                                                        </Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Group
                                                            gap={4}
                                                            justify="flex-end"
                                                            wrap="nowrap"
                                                        >
                                                            <ActionIcon
                                                                aria-label={t('common.action.edit')}
                                                                onClick={() => openEdit(domain)}
                                                                variant="subtle"
                                                            >
                                                                <TbEdit size={17} />
                                                            </ActionIcon>
                                                            <Tooltip
                                                                label={
                                                                    inUse
                                                                        ? t(
                                                                              lastPrimary
                                                                                  ? 'subscription-domains.last-primary'
                                                                                  : 'subscription-domains.remove-disabled'
                                                                          )
                                                                        : t('common.action.delete')
                                                                }
                                                            >
                                                                <ActionIcon
                                                                    aria-label={t(
                                                                        'common.action.delete'
                                                                    )}
                                                                    color="red"
                                                                    disabled={
                                                                        inUse || remove.isPending
                                                                    }
                                                                    onClick={() => {
                                                                        remove.reset()
                                                                        setRemoveTarget(domain)
                                                                    }}
                                                                    variant="subtle"
                                                                >
                                                                    <TbTrash size={17} />
                                                                </ActionIcon>
                                                            </Tooltip>
                                                        </Group>
                                                    </Table.Td>
                                                </Table.Tr>
                                            )
                                        })}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        )}
                    </Stack>
                </SectionCard.Section>
            </SectionCard.Root>

            <Modal
                centered
                opened={!!removeTarget}
                onClose={() => {
                    if (!remove.isPending) setRemoveTarget(null)
                }}
                title={t('subscription-domains.remove-title')}
            >
                {removeTarget && (
                    <Stack>
                        <Text>
                            {t('subscription-domains.remove-confirm', {
                                domain: removeTarget.domain
                            })}
                        </Text>
                        {removeTarget.usersCount > 0 && (
                            <Alert color="yellow">
                                {t('subscription-domains.remove-reassign', {
                                    count: removeTarget.usersCount
                                })}
                            </Alert>
                        )}
                        {remove.isError && (
                            <Alert color="red">{t('subscription-domains.remove-failed')}</Alert>
                        )}
                        <Group justify="flex-end">
                            <Button
                                variant="default"
                                disabled={remove.isPending}
                                onClick={() => setRemoveTarget(null)}
                            >
                                {t('common.action.cancel')}
                            </Button>
                            <Button
                                color="red"
                                loading={remove.isPending}
                                onClick={() => remove.mutate(removeTarget)}
                            >
                                {t('common.action.delete')}
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>

            <Modal
                centered
                opened={!!setupDomain}
                onClose={() => {
                    setSetupDomain(null)
                    setExistingLink('')
                }}
                title={t('subscription-domains.cdn-setup')}
            >
                {setupDomain && (
                    <Stack>
                        <Text size="sm">{t('subscription-domains.gateway-help')}</Text>
                        {credentials.isPending && <Loader size="sm" />}
                        {credentials.isError && (
                            <Alert color="red">
                                {t('subscription-domains.credentials-failed')}
                            </Alert>
                        )}
                        {credentials.data && (
                            <>
                                {copyableField(
                                    t('subscription-domains.request-header-name'),
                                    credentials.data.requestHeaderName
                                )}
                                {copyableField(
                                    t('subscription-domains.request-header-value'),
                                    credentials.data.requestHeaderValue,
                                    true
                                )}
                            </>
                        )}
                        <Text size="sm" c="dimmed">
                            {t('subscription-domains.credentials-help')}
                        </Text>
                        {copyableField(
                            t('subscription-domains.origin'),
                            `https://${rows.find((row) => row.uuid === setupDomain.parentUuid)?.domain ?? ''}`
                        )}
                        {copyableField(
                            'Host / SNI',
                            rows.find((row) => row.uuid === setupDomain.parentUuid)?.domain ?? ''
                        )}
                        <Text size="sm" c="dimmed">
                            {t('subscription-domains.origin-help')}
                        </Text>
                        <Accordion variant="separated">
                            <Accordion.Item value="fallback">
                                <Accordion.Control>
                                    {t('subscription-domains.link-tools')}
                                </Accordion.Control>
                                <Accordion.Panel>
                                    <Stack gap="sm">
                                        <TextInput
                                            label={t('subscription-domains.existing-link')}
                                            description={t('subscription-domains.convert-help')}
                                            value={existingLink}
                                            onChange={(event) =>
                                                setExistingLink(event.currentTarget.value)
                                            }
                                            error={
                                                existingLink.trim() && !convertedLink
                                                    ? t('subscription-domains.invalid-link')
                                                    : undefined
                                            }
                                            autoComplete="off"
                                            spellCheck={false}
                                            dir="ltr"
                                        />
                                        <TextInput
                                            readOnly
                                            dir="ltr"
                                            label={t(
                                                convertedLink
                                                    ? 'subscription-domains.ready-link'
                                                    : 'subscription-domains.public-link'
                                            )}
                                            value={
                                                convertedLink ??
                                                `${setupDomain.publicBaseUrl}/${t('subscription-domains.key-placeholder')}`
                                            }
                                            rightSection={
                                                <CopyButton value={convertedLink ?? ''}>
                                                    {({ copied, copy }) => (
                                                        <ActionIcon
                                                            disabled={!convertedLink}
                                                            onClick={copy}
                                                            variant="subtle"
                                                            aria-label={t('common.action.copy')}
                                                        >
                                                            {copied ? (
                                                                <TbCheck size={16} />
                                                            ) : (
                                                                <TbCopy size={16} />
                                                            )}
                                                        </ActionIcon>
                                                    )}
                                                </CopyButton>
                                            }
                                        />
                                    </Stack>
                                </Accordion.Panel>
                            </Accordion.Item>
                        </Accordion>
                    </Stack>
                )}
            </Modal>

            <Modal
                centered
                onClose={() => setOpened(false)}
                opened={opened}
                title={t(editing ? 'subscription-domains.edit' : 'subscription-domains.add')}
            >
                <form onSubmit={form.onSubmit((values) => save.mutate(values))}>
                    <Stack>
                        <TextInput
                            label={t('subscription-domains.name')}
                            required
                            {...form.getInputProps('name')}
                        />
                        <TextInput
                            description={t('subscription-domains.domain-help')}
                            label={t('subscription-domains.domain')}
                            required
                            {...form.getInputProps('domain')}
                        />
                        <TextInput
                            description={t('subscription-domains.path-help')}
                            label={t('subscription-domains.path')}
                            placeholder="/api/sub"
                            {...form.getInputProps('path')}
                        />
                        <Select
                            data={[
                                {
                                    value: 'PRIMARY',
                                    label: t('subscription-domains.kind-primary')
                                },
                                { value: 'CDN', label: t('subscription-domains.kind-cdn') }
                            ]}
                            label={t('subscription-domains.type')}
                            {...form.getInputProps('kind')}
                            onChange={(value) => {
                                form.setFieldValue('kind', (value ?? 'PRIMARY') as DomainKind)
                                if (value !== 'CDN') form.setFieldValue('parentUuid', null)
                            }}
                        />
                        {form.values.kind === 'CDN' && (
                            <Select
                                data={primaryDomains
                                    .filter((domain) => domain.uuid !== editing?.uuid)
                                    .map((domain) => ({
                                        value: domain.uuid,
                                        label: `${domain.name} · ${domain.domain}${domain.path || '/'} · ${domain.aliasesCount}/${MAX_CDN_PER_PRIMARY} CDN`,
                                        disabled:
                                            domain.aliasesCount >= MAX_CDN_PER_PRIMARY &&
                                            !(
                                                editing?.kind === 'CDN' &&
                                                editing.parentUuid === domain.uuid
                                            )
                                    }))}
                                description={t('subscription-domains.cdn-help')}
                                label={t('subscription-domains.primary-domain')}
                                required
                                {...form.getInputProps('parentUuid')}
                            />
                        )}
                        {form.values.kind === 'PRIMARY' && (
                            <>
                                <Switch
                                    label={t('subscription-domains.make-default')}
                                    {...form.getInputProps('isDefault', { type: 'checkbox' })}
                                />
                                <Select
                                    label={t('subscription-domains.access-mode')}
                                    description={
                                        t('subscription-domains.access-help') +
                                        ' ' +
                                        t('subscription-domains.last-primary')
                                    }
                                    data={(['OPEN', 'CDN_ONLY', 'REDIRECT', 'BLOCKED'] as const)
                                        .filter(
                                            (value) =>
                                                form.values.kind === 'PRIMARY' ||
                                                value === 'OPEN' ||
                                                value === 'BLOCKED'
                                        )
                                        .map((value) => ({
                                            value,
                                            label: t(`subscription-domains.access-${value}`),
                                            disabled:
                                                (value === 'BLOCKED' &&
                                                    form.values.kind === 'PRIMARY' &&
                                                    !rows.some(
                                                        (row) =>
                                                            row.kind === 'PRIMARY' &&
                                                            row.uuid !== editing?.uuid &&
                                                            row.accessMode !== 'BLOCKED'
                                                    )) ||
                                                ((value === 'CDN_ONLY' || value === 'REDIRECT') &&
                                                    !rows.some(
                                                        (row) =>
                                                            row.kind === 'CDN' &&
                                                            row.parentUuid === editing?.uuid
                                                    ))
                                        }))}
                                    {...form.getInputProps('accessMode')}
                                    onChange={(value) => {
                                        form.setFieldValue(
                                            'accessMode',
                                            (value ?? 'OPEN') as DomainForm['accessMode']
                                        )
                                        if (value !== 'REDIRECT')
                                            form.setFieldValue('redirectDomainUuid', null)
                                    }}
                                />
                                {form.values.accessMode === 'REDIRECT' && (
                                    <Select
                                        label={t('subscription-domains.redirect-target')}
                                        required
                                        data={rows
                                            .filter(
                                                (row) =>
                                                    row.kind === 'CDN' &&
                                                    row.parentUuid === editing?.uuid &&
                                                    row.accessMode !== 'BLOCKED'
                                            )
                                            .map((row) => ({
                                                value: row.uuid,
                                                label: `${row.name} · ${row.domain}`
                                            }))}
                                        {...form.getInputProps('redirectDomainUuid')}
                                    />
                                )}
                                {form.values.accessMode !== 'OPEN' && (
                                    <Alert color="yellow">
                                        {t(
                                            form.values.accessMode === 'BLOCKED'
                                                ? form.values.kind === 'PRIMARY'
                                                    ? 'subscription-domains.block-family-warning'
                                                    : 'subscription-domains.block-cdn-warning'
                                                : 'subscription-domains.access-warning'
                                        )}
                                    </Alert>
                                )}
                            </>
                        )}
                        {form.values.kind === 'CDN' &&
                            rows.some(
                                (row) =>
                                    row.uuid === form.values.parentUuid &&
                                    row.accessMode === 'BLOCKED'
                            ) && (
                                <Alert color="yellow">
                                    {t('subscription-domains.parent-blocked')}
                                </Alert>
                            )}
                        {save.isError && (
                            <Alert color="red">
                                {t(
                                    lastPrimaryError
                                        ? 'subscription-domains.last-primary'
                                        : cdnLimitError
                                          ? 'subscription-domains.cdn-limit'
                                          : environmentError
                                            ? 'subscription-domains.environment-save-failed'
                                            : 'subscription-domains.failed'
                                )}
                            </Alert>
                        )}
                        <Group justify="flex-end">
                            <Button onClick={() => setOpened(false)} variant="default">
                                {t('common.action.cancel')}
                            </Button>
                            <Button
                                disabled={
                                    form.values.kind === 'PRIMARY' &&
                                    form.values.accessMode === 'REDIRECT' &&
                                    !form.values.redirectDomainUuid
                                }
                                loading={save.isPending}
                                type="submit"
                            >
                                {t('common.action.save')}
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>
        </>
    )
}

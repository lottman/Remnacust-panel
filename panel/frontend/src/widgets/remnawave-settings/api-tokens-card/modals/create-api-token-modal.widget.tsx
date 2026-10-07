import {
    ActionIcon,
    ActionIconGroup,
    Alert,
    Box,
    Button,
    CopyButton,
    Flex,
    Group,
    NumberInput,
    Stack,
    Switch,
    Text,
    TextInput,
    Tooltip
} from '@mantine/core'
import { useField } from '@mantine/form'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import {
    CreateApiTokenCommand,
    GetApiTokensCommand,
    UpdateApiTokenCommand
} from '@remnawave/backend-contract'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
    TbAlertTriangle,
    TbCheck,
    TbClearAll,
    TbClipboard,
    TbCookie,
    TbCopy,
    TbEye,
    TbHexagon,
    TbWorld
} from 'react-icons/tb'

import { queryClient } from '@shared/api'
import { QueryKeys, useCreateApiToken, useGetScopes, useUpdateApiToken } from '@shared/api/hooks'
import { useUiText } from '@shared/i18n/interface-text'
import { ModalFooter } from '@shared/ui/modal-footer'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { sleep } from '@shared/utils/misc'

import classes from '../api-token-card.module.css'
import { ScopeResourceRow } from './scope-resource-row'
import {
    buildScopes,
    expandScopesToKeys,
    getKindState,
    getReadKeys,
    getWriteKeys,
    ScopeResource
} from './scopes.utils'
import { ViewApiTokenContentWidget } from './view-api-token-modal.widget'

const DEFAULT_EXPIRES_IN_DAYS = 30

const SUBPAGE_PRESET_KEYS = [
    'subscription-page-configs:list',
    'subscription-page-configs:get',
    'subscriptions:subpage-config',
    'system:metadata',
    'users:by-username'
]

interface IProps {
    isMobile: boolean
    token?: GetApiTokensCommand.Response['response']['tokens'][number]
}

export const CreateApiTokenContentWidget = ({ isMobile, token }: IProps) => {
    const uiText = useUiText()

    const { t } = useTranslation()

    const { data: scopesData, isLoading, isError, refetch } = useGetScopes()

    const tokenNameField = useField<CreateApiTokenCommand.RequestBody['name']>({
        initialValue: token?.name ?? '',
        validateOnChange: true,
        validate: (value) => {
            const schema = token
                ? UpdateApiTokenCommand.RequestBodySchema
                : CreateApiTokenCommand.RequestBodySchema
            const result = schema.shape.name.safeParse(value)
            return result.success ? null : result.error.issues[0]?.message
        }
    })

    const [selectedEndpoints, setSelectedEndpoints] = useState<Set<string>>(new Set())
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [expiresInDays, setExpiresInDays] = useState<number | string>(DEFAULT_EXPIRES_IN_DAYS)
    const [fullAccess, setFullAccess] = useState(token?.scopes.includes('*') ?? false)
    const [initialized, setInitialized] = useState(!token)
    const [search, setSearch] = useState('')

    const resources = scopesData?.resources ?? []
    if (token && scopesData && !initialized) {
        setSelectedEndpoints(new Set(expandScopesToKeys(scopesData.resources, token.scopes)))
        setInitialized(true)
    }
    const visibleResources = resources
        .map((resource) => ({
            ...resource,
            endpoints: resource.endpoints.filter((endpoint) =>
                `${resource.resource} ${endpoint.key} ${endpoint.path} ${endpoint.method} ${endpoint.description} ${endpoint.key === 'limits:unlimited' ? t('limitsUnlimited.permission') : ''}`
                    .toLowerCase()
                    .includes(search.trim().toLowerCase())
            )
        }))
        .filter((resource) => resource.endpoints.length > 0)
    const submittedScopes = fullAccess ? ['*'] : buildScopes(resources, selectedEndpoints)
    const unknownScopes = (token?.scopes ?? []).filter(
        (scope) =>
            scope !== '*' &&
            !resources.some(
                (resource) =>
                    resource.resourceScopes.includes(scope) ||
                    resource.endpoints.some((endpoint) => endpoint.key === scope)
            )
    )
    const { mutate: updateApiToken, isPending: isUpdating } = useUpdateApiToken({
        mutationFns: {
            onSuccess: async () => {
                await queryClient.refetchQueries({
                    queryKey: QueryKeys.apiTokens.getAllApiTokens.queryKey
                })
                modals.closeAll()
            }
        }
    })

    const { mutate: createApiToken, isPending } = useCreateApiToken({
        mutationFns: {
            onSuccess: async (data) => {
                queryClient.refetchQueries({
                    queryKey: QueryKeys.apiTokens.getAllApiTokens.queryKey
                })
                modals.closeAll()

                await sleep(300)

                modals.open({
                    title: (
                        <BaseOverlayHeader
                            iconColor="teal"
                            IconComponent={TbCookie}
                            iconVariant="soft"
                            title={data.name}
                        />
                    ),
                    fullScreen: isMobile,
                    centered: true,
                    size: 'min(800px, 90vw)',
                    children: <ViewApiTokenContentWidget isMobile={isMobile} token={data} />
                })
            }
        }
    })

    const setKeys = (keys: string[], checked: boolean) => {
        setFullAccess(false)
        setSelectedEndpoints((prev) => {
            const next = new Set(prev)
            keys.forEach((key) => (checked ? next.add(key) : next.delete(key)))
            return next
        })
    }

    const toggleEndpoint = (key: string) => {
        setFullAccess(false)
        setSelectedEndpoints((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    const toggleKind = (resource: ScopeResource, kind: 'read' | 'write') => {
        const keys = kind === 'read' ? getReadKeys(resource) : getWriteKeys(resource)
        const state = getKindState(keys, selectedEndpoints)
        setKeys(keys, state !== 'on')
    }

    const toggleExpand = (name: string) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(name)) next.delete(name)
            else next.add(name)
            return next
        })
    }

    const presetRead = () => {
        setFullAccess(false)
        const next = new Set<string>()
        resources.forEach((resource) => getReadKeys(resource).forEach((key) => next.add(key)))
        setSelectedEndpoints(next)
    }

    const presetFull = () => {
        setFullAccess(true)
        const next = new Set<string>()
        resources.forEach((resource) =>
            resource.endpoints.forEach((endpoint) => next.add(endpoint.key))
        )
        setSelectedEndpoints(next)
    }

    const presetSubpage = () => {
        setFullAccess(false)
        setSelectedEndpoints(new Set(SUBPAGE_PRESET_KEYS))
    }

    const handlePasteScopes = async () => {
        try {
            const text = await navigator.clipboard.readText()
            const parsed: unknown = JSON.parse(text)
            if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
                throw new Error('not a string array')
            }
            const valid = new Set([
                '*',
                ...resources.flatMap((resource) => [
                    ...resource.resourceScopes,
                    ...resource.endpoints.map((endpoint) => endpoint.key)
                ])
            ])
            if (parsed.some((scope) => !valid.has(scope))) throw new Error('unknown scope')
            setFullAccess(parsed.includes('*'))
            setSelectedEndpoints(new Set(expandScopesToKeys(resources, parsed as string[])))
            notifications.show({
                title: uiText('scopes-pasted-a6e9e16'),
                message: `Imported ${parsed.length} scope(s) from clipboard`,
                color: 'teal'
            })
        } catch {
            notifications.show({
                title: uiText('invalid-scopes-400e90a'),
                message: uiText('clipboard-must-contain-a-json-array-of-scope-strings-7d61090'),
                color: 'red'
            })
        }
    }

    const handleSubmit = () => {
        if (token) {
            updateApiToken({
                route: { uuid: token.uuid },
                variables: {
                    name: tokenNameField.getValue(),
                    scopes: submittedScopes
                }
            })
            return
        }
        createApiToken({
            variables: {
                name: tokenNameField.getValue(),
                expiresInDays: Number(expiresInDays),
                scopes: submittedScopes
            }
        })
    }

    const isNameInvalid = !!tokenNameField.error || tokenNameField.getValue().trim() === ''
    const isExpiresInvalid = !Number.isInteger(Number(expiresInDays)) || Number(expiresInDays) < 1
    const canCreate =
        !isNameInvalid &&
        (Boolean(token) || !isExpiresInvalid) &&
        initialized &&
        !isLoading &&
        !isError &&
        Boolean(scopesData) &&
        !isPending &&
        !isUpdating

    return (
        <Stack gap="md">
            {!token && (
                <Box className={classes.oneTimeNotice}>
                    <TbAlertTriangle className={classes.oneTimeNoticeIcon} size={20} />
                    <Text className={classes.oneTimeNoticeText}>
                        <Trans
                            components={{
                                emphasis: <span className={classes.oneTimeNoticeEmphasis} />
                            }}
                            i18nKey="api-tokens-card.widget.one-time-notice"
                        />
                    </Text>
                </Box>
            )}
            {token && (
                <Text c="dimmed" size="sm">
                    {t('api-token-editor.existing-token')}
                </Text>
            )}

            <Flex
                align={isMobile ? 'stretch' : 'flex-start'}
                direction={isMobile ? 'column' : 'row'}
                gap="xs"
            >
                <TextInput
                    data-autofocus
                    flex={isMobile ? undefined : 1}
                    label={t('api-tokens-card.widget.token-name')}
                    placeholder={uiText('service-bot-4d196c6')}
                    required
                    {...tokenNameField.getInputProps()}
                />
                {!token && (
                    <NumberInput
                        allowDecimal={false}
                        allowNegative={false}
                        clampBehavior="strict"
                        label={t('api-tokens-card.widget.expires-in-days')}
                        max={999999}
                        min={1}
                        onChange={setExpiresInDays}
                        required
                        value={expiresInDays}
                        w={isMobile ? '100%' : 300}
                    />
                )}
            </Flex>

            <Group gap="xs">
                <Button
                    leftSection={<TbEye size={16} />}
                    disabled={!scopesData || isError || !initialized}
                    onClick={presetRead}
                    size="xs"
                    variant="default"
                >
                    {t('api-token-editor.read-only')}
                </Button>
                <Button
                    leftSection={<TbWorld size={16} />}
                    disabled={!scopesData || isError || !initialized}
                    onClick={presetFull}
                    size="xs"
                    variant="default"
                >
                    {t('api-tokens-card.widget.full-access')}
                </Button>
                <Button
                    leftSection={<TbHexagon size={16} />}
                    disabled={!scopesData || isError || !initialized}
                    onClick={presetSubpage}
                    size="xs"
                    variant="default"
                >
                    {uiText('subpage-9c141bb')}
                </Button>
            </Group>

            <Switch
                checked={fullAccess}
                disabled={!scopesData || isError || !initialized}
                label={t('api-tokens-card.widget.full-access')}
                description={t('api-token-editor.full-description')}
                onChange={(event) => {
                    if (event.currentTarget.checked) presetFull()
                    else setFullAccess(false)
                }}
            />
            {!fullAccess && (
                <Text c="dimmed" size="xs">
                    {t('api-token-editor.exact-description')}
                </Text>
            )}
            {isLoading && <Text role="status">{t('api-token-editor.loading')}</Text>}
            {isError && (
                <Alert color="red" title={t('api-token-editor.catalog-error')}>
                    <Button onClick={() => void refetch()} size="xs">
                        {t('api-token-editor.retry')}
                    </Button>
                </Alert>
            )}
            {initialized && unknownScopes.length > 0 && (
                <Alert color="yellow">
                    {t('api-token-editor.obsolete-scopes')} {unknownScopes.join(', ')}
                </Alert>
            )}
            <TextInput
                aria-label={t('api-token-editor.search')}
                placeholder={t('api-token-editor.search')}
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
            />

            <Stack gap={6}>
                {visibleResources.map((resource) => (
                    <ScopeResourceRow
                        endpoints={resource.endpoints}
                        expanded={Boolean(search.trim()) || expanded.has(resource.resource)}
                        key={resource.resource}
                        onToggleEndpoint={toggleEndpoint}
                        onToggleExpand={() => toggleExpand(resource.resource)}
                        onToggleKind={(kind) => toggleKind(resource, kind)}
                        resource={resource}
                        selectedEndpoints={selectedEndpoints}
                    />
                ))}
            </Stack>

            <ModalFooter isMobile={isMobile}>
                <ActionIconGroup ml="auto">
                    <Tooltip label={t('common.action.clear')}>
                        <ActionIcon
                            aria-label={t('common.action.clear')}
                            color="gray"
                            onClick={() => {
                                setFullAccess(false)
                                setSelectedEndpoints(new Set())
                            }}
                            size="input-md"
                            variant="soft"
                        >
                            <TbClearAll size={24} />
                        </ActionIcon>
                    </Tooltip>

                    <CopyButton timeout={1600} value={JSON.stringify(submittedScopes, null, 2)}>
                        {({ copied, copy }) => (
                            <Tooltip label={t('common.action.copy')}>
                                <ActionIcon
                                    aria-label={t('common.action.copy')}
                                    color={copied ? 'teal' : 'gray'}
                                    onClick={copy}
                                    size="input-md"
                                    variant="soft"
                                >
                                    {copied ? <TbCheck size={24} /> : <TbCopy size={24} />}
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </CopyButton>

                    <Tooltip label={t('common.action.paste')}>
                        <ActionIcon
                            aria-label={t('common.action.paste')}
                            color="gray"
                            onClick={handlePasteScopes}
                            size="input-md"
                            variant="soft"
                        >
                            <TbClipboard size={24} />
                        </ActionIcon>
                    </Tooltip>
                </ActionIconGroup>

                <Button
                    color="teal"
                    disabled={!canCreate}
                    leftSection={<TbCookie size="24px" />}
                    loading={isPending || isUpdating}
                    onClick={handleSubmit}
                    size="md"
                    variant="soft"
                >
                    {token ? t('common.action.save') : t('common.action.create')}
                </Button>
            </ModalFooter>
        </Stack>
    )
}

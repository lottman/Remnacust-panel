import type {
    ApiOperation,
    ApiReference,
    Control,
    DocArticle,
    DocManifest,
    DocLanguage,
    DocVariable,
    Registry
} from './documentation.types'
import type { ParseKeys } from 'i18next'

import {
    ActionIcon,
    Alert,
    Badge,
    Box,
    Button,
    Code,
    Group,
    Loader,
    Select,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
    Title
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useQuery } from '@tanstack/react-query'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    TbApi,
    TbArrowUpRight,
    TbBook2,
    TbCheck,
    TbCopy,
    TbDownload,
    TbLink,
    TbSearch,
    TbVersions,
    TbX
} from 'react-icons/tb'
import ReactMarkdown from 'react-markdown'
import { Link, useLocation, useSearchParams } from 'react-router'
import remarkGfm from 'remark-gfm'

import { ROUTES } from '@shared/constants'
import { Page } from '@shared/ui/page'
import { PageHeaderShared } from '@shared/ui/page-header/page-header.shared'

import { CompatibilityDocumentation, compatibilityTabLabel } from './compatibility'
import classes from './documentation.module.css'
import { curlExample, matchesSearch } from './reference-utils'
import { SchemaTree } from './schema-tree'

const asset = (name: string) => `${import.meta.env.BASE_URL}documentation/${name}`
const docLanguages: DocLanguage[] = ['en', 'ru', 'fa', 'zh']
async function read<T>(name: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(asset(name), { signal })
    if (!response.ok) throw new Error(`Documentation ${name}: ${response.status}`)
    return response.json() as Promise<T>
}

function CopyCode({ text }: { text: string }) {
    const { t } = useTranslation()
    const [copied, setCopied] = useState(false)
    useEffect(() => {
        if (!copied) return
        const timer = setTimeout(() => setCopied(false), 1800)
        return () => clearTimeout(timer)
    }, [copied])
    return (
        <Box className={classes.codeBlock}>
            <ActionIcon
                className={classes.codeCopy}
                aria-label={t('common.action.copy')}
                variant="default"
                onClick={() =>
                    void navigator.clipboard
                        .writeText(text)
                        .then(() => setCopied(true))
                        .catch(() =>
                            notifications.show({
                                message: t('documentation.copyFailed'),
                                color: 'red'
                            })
                        )
                }
            >
                {copied ? <TbCheck size={17} /> : <TbCopy size={17} />}
            </ActionIcon>
            <pre dir="ltr">
                <code>{text}</code>
            </pre>
        </Box>
    )
}

export function DocumentationPage({ mode = 'guide' }: { mode?: 'guide' | 'api' }) {
    const [params] = useSearchParams()
    return params.get('tab') === 'versions' ? (
        <CompatibilityDocumentation />
    ) : (
        <DocumentationContentPage mode={mode} />
    )
}

function DocumentationContentPage({ mode }: { mode: 'guide' | 'api' }) {
    const { t, i18n } = useTranslation()
    const location = useLocation()
    const [params, setParams] = useSearchParams()
    const apiMode = mode === 'api'
    const requestedLanguage = params.get('language') ?? i18n.resolvedLanguage ?? i18n.language
    const language = docLanguages.find((code) => requestedLanguage.startsWith(code)) ?? 'en'
    const articleId = params.get('article') ?? 'architecture'
    const needsVariables = !apiMode && articleId === 'placeholders'
    const [search, setSearch] = useState(params.get('q') ?? '')
    const query = useDeferredValue(search)
    const schemaMode = params.has('schema')
    const general = useQuery({
        queryKey: ['documentation', 'index', mode],
        staleTime: Infinity,
        queryFn: async ({ signal }) => {
            const [registry, controls, manifest] = await Promise.all([
                read<Registry>('registry.json', signal),
                apiMode
                    ? Promise.resolve({} as Record<string, Control[]>)
                    : read<Record<string, Control[]>>('controls.json', signal),
                read<DocManifest>('manifest.json', signal)
            ])
            return { registry, controls, manifest }
        }
    })
    const guide = useQuery({
        queryKey: ['documentation', 'guide', language],
        staleTime: Infinity,
        enabled: !apiMode,
        queryFn: async ({ signal }) => {
            const [content] = await Promise.all([
                read<DocArticle[]>(`guide-${language}.json`, signal),
                i18n.loadLanguages(language)
            ])
            if (!i18n.hasResourceBundle(language, 'remnawave'))
                throw new Error(`Documentation labels unavailable: ${language}`)
            return content
        }
    })
    const api = useQuery({
        queryKey: ['documentation', 'api'],
        staleTime: Infinity,
        enabled: apiMode,
        queryFn: ({ signal }) => read<ApiReference>('api.json', signal)
    })
    const variables = useQuery({
        queryKey: ['documentation', 'variables'],
        staleTime: Infinity,
        enabled: needsVariables,
        queryFn: ({ signal }) => read<DocVariable[]>('variables.json', signal)
    })
    const articleIndex = useMemo(
        () => new Map(general.data?.registry.articles.map((item) => [item.id, item])),
        [general.data?.registry]
    )
    const selectionSearch = (key: string, value: string) => {
        const next = new URLSearchParams(params)
        next.set(key, value)
        if (key === 'operation') next.delete('schema')
        if (key === 'schema') next.delete('operation')
        return next.toString()
    }
    const change = (key: string, value: string) =>
        setParams(new URLSearchParams(selectionSearch(key, value)))
    const article = guide.data?.find((item) => item.id === articleId)
    const articleMeta = articleIndex.get(articleId)
    const operationId =
        params.get('operation') ??
        api.data?.endpoints.find((item) => item.path === '/api/limits/unlimited')?.id
    const operation = api.data?.endpoints.find((item) => item.id === operationId)
    const schemaName = params.get('schema') ?? ''
    const translateKey = (key?: string, fallback = '') =>
        (key ? String(t(key as ParseKeys, { defaultValue: fallback, lng: language })) : fallback)
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/?[a-z][^>]*>/gi, '')
    const fields = (general.data?.controls[articleId] ?? []).filter(
        (field) => translateKey(field.labelKey, field.label).trim().length > 0
    )
    const filteredArticles = useMemo(
        () =>
            (guide.data ?? []).filter((item) => {
                const meta = articleIndex.get(item.id)
                const controls = general.data?.controls[item.id] ?? []
                const fieldText = controls
                    .map((field) => [
                        field.explanation?.[language],
                        translateKey(field.labelKey, field.label),
                        translateKey(field.descriptionKey)
                    ])
                    .join(' ')
                return matchesSearch(
                    [
                        item.title,
                        meta?.ru,
                        meta?.en,
                        item.sections
                            .map((section) => `${section.title} ${section.body}`)
                            .join(' '),
                        fieldText
                    ].join(' '),
                    query
                )
            }),
        [guide.data, general.data, articleIndex, query, t, language]
    )
    const filteredOperations = (api.data?.endpoints ?? []).filter((item) =>
        matchesSearch(
            [
                item.method,
                item.path,
                item.summary,
                item.tags?.join(' '),
                item['x-remnacust-scope']
            ].join(' '),
            query
        )
    )
    const schemaNames = Object.keys(api.data?.schemas ?? {})
        .filter((name) =>
            matchesSearch(`${name} ${api.data?.schemas[name].description ?? ''}`, query)
        )
        .sort()
    useEffect(() => {
        if (!location.hash || !article) return
        const frame = requestAnimationFrame(() =>
            document
                .getElementById(decodeURIComponent(location.hash.slice(1)))
                ?.scrollIntoView({ block: 'start' })
        )
        return () => cancelAnimationFrame(frame)
    }, [location.hash, article])
    useEffect(() => {
        if (location.hash) return
        const frame = requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
        return () => cancelAnimationFrame(frame)
    }, [articleId, operationId, schemaName, mode])
    const copyLink = async () => {
        const url = new URL(window.location.href)
        url.pathname = location.pathname
        url.search = params.toString()
        url.hash = location.hash
        try {
            await navigator.clipboard.writeText(url.href)
            notifications.show({ message: t('documentation.copied'), color: 'teal' })
        } catch {
            notifications.show({ message: t('documentation.copyFailed'), color: 'red' })
        }
    }
    const errors =
        general.isError ||
        (!apiMode && guide.isError) ||
        (apiMode && api.isError) ||
        (needsVariables && variables.isError)
    const pending =
        general.isPending ||
        (apiMode ? api.isPending : guide.isPending) ||
        (needsVariables && variables.isPending)
    const selectedValid = apiMode
        ? schemaMode
            ? !!api.data?.schemas[schemaName]
            : !!operation
        : !!article
    const accessLabel = (access: ApiOperation['x-remnacust-access']) =>
        access === 'api-token'
            ? t('documentation.token')
            : access === 'admin'
              ? t('documentation.admin')
              : access === 'special'
                ? t('documentation.special')
                : t('documentation.public')
    return (
        <Page title={t('documentation.title')}>
            <PageHeaderShared
                title={t('documentation.title')}
                icon={<TbBook2 size={24} />}
                actions={
                    <Group gap="xs">
                        <Button
                            component="a"
                            href={asset(apiMode ? 'openapi.json' : `guide-${language}.md`)}
                            download
                            leftSection={<TbDownload size={16} />}
                            variant="default"
                            size="sm"
                        >
                            {apiMode
                                ? t('documentation.downloadSpec')
                                : t('documentation.download')}
                        </Button>
                        <ActionIcon
                            aria-label={t('documentation.permalink')}
                            variant="default"
                            onClick={() => void copyLink()}
                        >
                            <TbLink size={18} />
                        </ActionIcon>
                    </Group>
                }
            />
            <Box className={classes.toolbar}>
                <Group className={classes.tabs} gap={6}>
                    <Button
                        component={Link}
                        to={ROUTES.DASHBOARD.DOCUMENTATION.GUIDE}
                        variant={apiMode ? 'subtle' : 'light'}
                        leftSection={<TbBook2 size={17} />}
                    >
                        {t('documentation.guide')}
                    </Button>
                    <Button
                        component={Link}
                        to={ROUTES.DASHBOARD.DOCUMENTATION.API}
                        variant={apiMode ? 'light' : 'subtle'}
                        leftSection={<TbApi size={17} />}
                    >
                        {t('documentation.api')}
                    </Button>
                    <Button
                        component={Link}
                        to={`${ROUTES.DASHBOARD.DOCUMENTATION.GUIDE}?tab=versions&language=${language}`}
                        leftSection={<TbVersions size={17} />}
                        variant="subtle"
                    >
                        {compatibilityTabLabel(language)}
                    </Button>
                </Group>
                <TextInput
                    className={classes.search}
                    aria-label={apiMode ? t('documentation.apiSearch') : t('documentation.search')}
                    placeholder={apiMode ? t('documentation.apiSearch') : t('documentation.search')}
                    value={search}
                    onChange={(event) => setSearch(event.currentTarget.value)}
                    leftSection={<TbSearch size={17} />}
                    rightSection={
                        search ? (
                            <ActionIcon
                                aria-label={t('documentation.clear')}
                                variant="subtle"
                                onClick={() => setSearch('')}
                            >
                                <TbX size={15} />
                            </ActionIcon>
                        ) : null
                    }
                />
                {!apiMode && (
                    <Select
                        w={145}
                        aria-label={t('documentation.language')}
                        allowDeselect={false}
                        value={language}
                        onChange={(value) => change('language', value ?? 'en')}
                        data={[
                            { value: 'ru', label: 'Русский' },
                            { value: 'en', label: 'English' },
                            { value: 'fa', label: 'فارسی' },
                            { value: 'zh', label: '简体中文' }
                        ]}
                    />
                )}
            </Box>
            {errors ? (
                <Alert color="red" role="alert">
                    <Group>
                        <Text>{t('documentation.error')}</Text>
                        <Button
                            variant="light"
                            onClick={() => {
                                void general.refetch()
                                if (needsVariables) void variables.refetch()
                                if (apiMode) void api.refetch()
                                else void guide.refetch()
                            }}
                        >
                            {t('documentation.retry')}
                        </Button>
                    </Group>
                </Alert>
            ) : pending ? (
                <Group role="status" p="xl">
                    <Loader size="sm" />
                    <Text>{t('documentation.loading')}</Text>
                </Group>
            ) : (
                <>
                    <Box className={classes.layout} data-documentation-mode={mode}>
                        <Box
                            component="nav"
                            className={classes.index}
                            dir={!apiMode && language === 'fa' ? 'rtl' : undefined}
                            aria-label={t('documentation.contents')}
                        >
                            <Text c="dimmed" size="xs" fw={600} mb="sm">
                                {apiMode
                                    ? t('documentation.operations', {
                                          count: general.data?.manifest.endpoints
                                      })
                                    : t('documentation.articles', {
                                          count: general.data?.manifest.articles
                                      })}
                            </Text>
                            {apiMode ? (
                                <>
                                    <SegmentedControl
                                        fullWidth
                                        size="xs"
                                        mb="md"
                                        value={schemaMode ? 'schemas' : 'operations'}
                                        onChange={(value) =>
                                            change(
                                                value === 'schemas' ? 'schema' : 'operation',
                                                value === 'schemas'
                                                    ? (Object.keys(api.data?.schemas ?? {})[0] ??
                                                          '')
                                                    : (operationId ?? '')
                                            )
                                        }
                                        data={[
                                            {
                                                value: 'operations',
                                                label: t('documentation.operation')
                                            },
                                            { value: 'schemas', label: t('documentation.schemas') }
                                        ]}
                                    />
                                    {(schemaMode ? schemaNames : filteredOperations).length ===
                                        0 && (
                                        <Text size="sm" c="dimmed">
                                            {t('documentation.searchEmpty')}
                                        </Text>
                                    )}
                                    {schemaMode
                                        ? schemaNames.map((name) => (
                                              <Link
                                                  key={name}
                                                  className={classes.indexEntry}
                                                  data-active={name === schemaName}
                                                  aria-current={
                                                      name === schemaName ? 'page' : undefined
                                                  }
                                                  title={name}
                                                  to={{
                                                      pathname: location.pathname,
                                                      search: selectionSearch('schema', name)
                                                  }}
                                              >
                                                  <span className={classes.schemaName}>{name}</span>
                                              </Link>
                                          ))
                                        : filteredOperations.map((item) => (
                                              <Link
                                                  key={item.id}
                                                  className={classes.indexEntry}
                                                  data-active={item.id === operationId}
                                                  aria-current={
                                                      item.id === operationId ? 'page' : undefined
                                                  }
                                                  to={{
                                                      pathname: location.pathname,
                                                      search: selectionSearch('operation', item.id)
                                                  }}
                                              >
                                                  <span
                                                      className={classes.method}
                                                      data-method={item.method}
                                                  >
                                                      {item.method}
                                                  </span>
                                                  <span className={classes.endpointPath} dir="ltr">
                                                      {item.path}
                                                  </span>
                                              </Link>
                                          ))}
                                </>
                            ) : (
                                <>
                                    {filteredArticles.length === 0 && (
                                        <Text size="sm" c="dimmed">
                                            {t('documentation.searchEmpty')}
                                        </Text>
                                    )}
                                    {general.data?.registry.categories.map((category) => {
                                        const items = filteredArticles.filter(
                                            (item) =>
                                                articleIndex.get(item.id)?.category === category.id
                                        )
                                        return items.length ? (
                                            <Box key={category.id} mb="md">
                                                <Text
                                                    className={classes.category}
                                                    size="xs"
                                                    c="dimmed"
                                                    fw={600}
                                                >
                                                    {category[language]}
                                                </Text>
                                                {items.map((item) => (
                                                    <Link
                                                        key={item.id}
                                                        className={classes.indexEntry}
                                                        data-active={item.id === articleId}
                                                        aria-current={
                                                            item.id === articleId
                                                                ? 'page'
                                                                : undefined
                                                        }
                                                        to={{
                                                            pathname: location.pathname,
                                                            search: selectionSearch(
                                                                'article',
                                                                item.id
                                                            )
                                                        }}
                                                    >
                                                        {item.title}
                                                    </Link>
                                                ))}
                                            </Box>
                                        ) : null
                                    })}
                                </>
                            )}
                        </Box>
                        <Box className={classes.content}>
                            {!selectedValid ? (
                                <Alert>{t('documentation.invalidLink')}</Alert>
                            ) : apiMode && api.data ? (
                                schemaMode ? (
                                    <article className={classes.article} key={schemaName}>
                                        <Text size="sm" c="dimmed">
                                            {t('documentation.schemas')}
                                        </Text>
                                        <Title order={2} mb="lg" className={classes.articleTitle}>
                                            {schemaName}
                                        </Title>
                                        <SchemaTree
                                            schema={api.data.schemas[schemaName]}
                                            schemas={api.data.schemas}
                                            key={schemaName}
                                        />
                                    </article>
                                ) : operation ? (
                                    <article className={classes.article} key={operation.id}>
                                        <Group gap="sm" mb="sm">
                                            <Badge variant="light" size="lg">
                                                {operation.method}
                                            </Badge>
                                            <Text c="dimmed" size="sm">
                                                {operation.tags?.join(' · ')}
                                            </Text>
                                        </Group>
                                        <Title order={2} className={classes.apiTitle} dir="ltr">
                                            {operation.path}
                                        </Title>
                                        <Text mt="sm" mb="lg">
                                            {operation.summary}
                                        </Text>
                                        <Box className={classes.accessBox}>
                                            <Group gap="sm">
                                                <Text size="sm" fw={600}>
                                                    {t('documentation.access')}
                                                </Text>
                                                <Badge
                                                    variant="light"
                                                    color={
                                                        operation['x-remnacust-access'] ===
                                                        'api-token'
                                                            ? 'teal'
                                                            : 'gray'
                                                    }
                                                >
                                                    {accessLabel(operation['x-remnacust-access'])}
                                                </Badge>
                                            </Group>
                                            {operation['x-remnacust-scope'] && (
                                                <>
                                                    <Text size="sm" mt="sm">
                                                        {t('documentation.scope')}:{' '}
                                                        <Code>
                                                            {operation['x-remnacust-scope']}
                                                        </Code>
                                                    </Text>
                                                    <Text c="dimmed" size="xs" mt={6}>
                                                        {t('documentation.alternatives')}
                                                        <Code>
                                                            {operation['x-remnacust-resource']}:
                                                            {operation['x-remnacust-kind']}
                                                        </Code>
                                                        ,{' '}
                                                        <Code>
                                                            {operation['x-remnacust-resource']}:*
                                                        </Code>
                                                        , <Code>*</Code>
                                                    </Text>
                                                </>
                                            )}
                                            {operation['x-remnacust-access'] === 'public' && (
                                                <Text size="xs" c="dimmed" mt="sm">
                                                    {t('documentation.authNote')}
                                                </Text>
                                            )}
                                            {operation.security && (
                                                <details className={classes.technical}>
                                                    <summary>security</summary>
                                                    <CopyCode
                                                        text={JSON.stringify(
                                                            {
                                                                security: operation.security,
                                                                schemes: Object.fromEntries(
                                                                    Object.keys(
                                                                        operation.security[0] ?? {}
                                                                    ).map((name) => [
                                                                        name,
                                                                        api.data?.securitySchemes[
                                                                            name
                                                                        ]
                                                                    ])
                                                                )
                                                            },
                                                            null,
                                                            2
                                                        )}
                                                    />
                                                </details>
                                            )}
                                        </Box>
                                        <Text size="xs" c="dimmed" mt="md">
                                            {t('documentation.contractNote')}
                                        </Text>
                                        {operation.description && (
                                            <Box className={classes.prose} mt="lg">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {operation.description}
                                                </ReactMarkdown>
                                            </Box>
                                        )}
                                        <section className={classes.section}>
                                            <Title order={3}>{t('documentation.params')}</Title>
                                            {operation.parameters?.length ? (
                                                operation.parameters.map((parameter) => (
                                                    <Box
                                                        key={`${parameter.in}:${parameter.name}`}
                                                        mb="sm"
                                                    >
                                                        <Text size="xs" c="dimmed">
                                                            {parameter.in}
                                                        </Text>
                                                        <SchemaTree
                                                            name={parameter.name}
                                                            schema={{
                                                                ...parameter.schema,
                                                                description:
                                                                    parameter.description ??
                                                                    parameter.schema?.description
                                                            }}
                                                            schemas={api.data?.schemas ?? {}}
                                                            required={parameter.required}
                                                        />
                                                    </Box>
                                                ))
                                            ) : (
                                                <Text c="dimmed" size="sm">
                                                    {t('documentation.none')}
                                                </Text>
                                            )}
                                        </section>
                                        <section className={classes.section}>
                                            <Title order={3}>{t('documentation.request')}</Title>
                                            {operation.requestBody?.content ? (
                                                Object.entries(operation.requestBody.content).map(
                                                    ([type, payload]) => (
                                                        <Box key={type}>
                                                            <Code>{type}</Code>
                                                            {payload.schema ? (
                                                                <SchemaTree
                                                                    schema={payload.schema}
                                                                    schemas={
                                                                        api.data?.schemas ?? {}
                                                                    }
                                                                />
                                                            ) : (
                                                                <Text size="sm">
                                                                    {t('documentation.noSchema')}
                                                                </Text>
                                                            )}
                                                        </Box>
                                                    )
                                                )
                                            ) : (
                                                <Text c="dimmed" size="sm">
                                                    {t('documentation.none')}
                                                </Text>
                                            )}
                                        </section>
                                        <section className={classes.section}>
                                            <Title order={3}>{t('documentation.response')}</Title>
                                            {Object.entries(operation.responses ?? {}).map(
                                                ([code, response]) => (
                                                    <details
                                                        className={classes.response}
                                                        key={code}
                                                        open={code.startsWith('2')}
                                                    >
                                                        <summary>
                                                            <Code>{code}</Code>{' '}
                                                            {response.description}
                                                        </summary>
                                                        {Object.entries(response.content ?? {}).map(
                                                            ([type, payload]) => (
                                                                <Box key={type} mt="sm">
                                                                    <Code>{type}</Code>
                                                                    {payload.schema ? (
                                                                        <SchemaTree
                                                                            schema={payload.schema}
                                                                            schemas={
                                                                                api.data?.schemas ??
                                                                                {}
                                                                            }
                                                                        />
                                                                    ) : (
                                                                        <Text size="sm">
                                                                            {t(
                                                                                'documentation.noSchema'
                                                                            )}
                                                                        </Text>
                                                                    )}
                                                                </Box>
                                                            )
                                                        )}
                                                    </details>
                                                )
                                            )}
                                        </section>
                                        <section className={classes.section}>
                                            <Title order={3}>{t('documentation.example')}</Title>
                                            <Text size="sm" c="dimmed" mb="sm">
                                                {t('documentation.exampleNote')}
                                            </Text>
                                            <CopyCode
                                                text={curlExample(operation, api.data.schemas)}
                                            />
                                        </section>
                                    </article>
                                ) : null
                            ) : article ? (
                                <article
                                    className={classes.article}
                                    key={`${language}:${article.id}`}
                                    lang={language}
                                    dir={language === 'fa' ? 'rtl' : 'ltr'}
                                >
                                    <Group justify="space-between" mb="lg">
                                        <Badge variant="light">Remnacust</Badge>
                                        {articleMeta?.route && (
                                            <Button
                                                component={Link}
                                                to={articleMeta.route}
                                                size="xs"
                                                variant="subtle"
                                                rightSection={<TbArrowUpRight size={15} />}
                                            >
                                                {t('documentation.openPage')}
                                            </Button>
                                        )}
                                    </Group>
                                    <Title order={1} className={classes.articleTitle}>
                                        {article.title}
                                    </Title>
                                    <nav
                                        className={classes.articleContents}
                                        aria-label={t('documentation.contents')}
                                    >
                                        {article.sections.map((section) => (
                                            <Link
                                                to={{
                                                    pathname: location.pathname,
                                                    search: params.toString(),
                                                    hash: `#${section.id}`
                                                }}
                                                key={section.id}
                                            >
                                                {section.title}
                                            </Link>
                                        ))}
                                    </nav>
                                    {article.sections.map((section) => (
                                        <section
                                            className={classes.section}
                                            id={section.id}
                                            key={section.id}
                                        >
                                            <Title order={3}>{section.title}</Title>
                                            <Box className={classes.prose}>
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        a: ({ href, children }) =>
                                                            href?.startsWith('/dashboard/') ? (
                                                                <Link to={href}>{children}</Link>
                                                            ) : (
                                                                <a href={href}>{children}</a>
                                                            )
                                                    }}
                                                >
                                                    {section.body}
                                                </ReactMarkdown>
                                            </Box>
                                        </section>
                                    ))}
                                    {article.id === 'placeholders' && (
                                        <section className={classes.section}>
                                            <Title order={3}>{t('documentation.variables')}</Title>
                                            <Stack gap={8}>
                                                {variables.data?.map((variable) => (
                                                    <Box
                                                        className={classes.control}
                                                        key={variable.name}
                                                    >
                                                        <Code>{`{{${variable.name}}}`}</Code>
                                                        {variable.args.length > 0 && (
                                                            <Text size="xs" c="dimmed">
                                                                {variable.args.join(', ')}
                                                            </Text>
                                                        )}
                                                        <Text size="xs" c="dimmed" mt={5}>
                                                            {variable.description[language]}
                                                        </Text>
                                                        {/^TRAFFICLOCATION.*(?:MB|GB)(?:TEG)?$/.test(
                                                            variable.name
                                                        ) && (
                                                            <Text size="xs" c="dimmed">
                                                                {t('documentation.noUnits')}
                                                            </Text>
                                                        )}
                                                    </Box>
                                                ))}
                                            </Stack>
                                        </section>
                                    )}
                                    {fields.length > 0 && (
                                        <section className={classes.section}>
                                            <Title order={3}>
                                                {translateKey('documentation.fields')}
                                            </Title>
                                            <Text c="dimmed" size="sm" mb="md">
                                                {translateKey('documentation.fieldNote')}
                                            </Text>
                                            <Stack gap={0}>
                                                {fields.map((field, index) => (
                                                    <Box className={classes.control} key={index}>
                                                        <Group gap={8}>
                                                            <Text size="sm" fw={600}>
                                                                {translateKey(
                                                                    field.labelKey,
                                                                    field.label
                                                                )}
                                                            </Text>
                                                        </Group>
                                                        {(field.explanation?.[language] ||
                                                            field.descriptionKey) && (
                                                            <Box
                                                                mt={6}
                                                                className={classes.fieldHelp}
                                                            >
                                                                {field.explanation?.[language] ||
                                                                    translateKey(
                                                                        field.descriptionKey
                                                                    )}
                                                            </Box>
                                                        )}
                                                        {[field.min, field.max].some(
                                                            (value) =>
                                                                value &&
                                                                /^-?\d+(\.\d+)?$/.test(value)
                                                        ) && (
                                                            <Text c="dimmed" size="xs" mt={4}>
                                                                {t('documentation.constraints')}:{' '}
                                                                {field.min &&
                                                                /^-?\d+(\.\d+)?$/.test(field.min)
                                                                    ? `min ${field.min}`
                                                                    : ''}{' '}
                                                                {field.max &&
                                                                /^-?\d+(\.\d+)?$/.test(field.max)
                                                                    ? `max ${field.max}`
                                                                    : ''}
                                                            </Text>
                                                        )}
                                                    </Box>
                                                ))}
                                            </Stack>
                                        </section>
                                    )}
                                </article>
                            ) : null}
                            {apiMode && (
                                <Text className={classes.version} size="xs" c="dimmed">
                                    {t('documentation.referenceVersion')}: Remnacust{' '}
                                    {general.data?.manifest.backendVersion} · Xray{' '}
                                    {general.data?.manifest.coreVersion}
                                </Text>
                            )}
                        </Box>
                    </Box>
                </>
            )}
        </Page>
    )
}

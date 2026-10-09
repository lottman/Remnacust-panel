import type { DocLanguage } from './documentation.types'

import { ActionIcon, Box, Button, Group, Select } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { createContext, useContext, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TbApi, TbBook2, TbDownload, TbLink, TbVersions } from 'react-icons/tb'
import { Link, useLocation, useSearchParams } from 'react-router'

import { ROUTES } from '@shared/constants'
import { PageHeaderShared } from '@shared/ui/page-header/page-header.shared'

import classes from './documentation.module.css'

type DocumentationMode = 'guide' | 'api' | 'versions'
const languages: DocLanguage[] = ['en', 'ru', 'fa', 'zh']
const DocumentationLanguage = createContext<DocLanguage>('en')

export function DocumentationLocale({ children }: { children: ReactNode }) {
    const { i18n } = useTranslation()
    const [params] = useSearchParams()
    const requested = params.get('language') ?? i18n.resolvedLanguage ?? i18n.language
    const language = languages.find((code) => requested.startsWith(code)) ?? 'en'
    return <DocumentationLanguage value={language}>{children}</DocumentationLanguage>
}

export function useDocumentationTranslation() {
    const language = useContext(DocumentationLanguage)
    return { ...useTranslation('remnawave', { lng: language }), language }
}

export function DocumentationHeader({ mode }: { mode: DocumentationMode }) {
    const { t, language } = useDocumentationTranslation()
    const location = useLocation()
    const [params] = useSearchParams()
    const download =
        mode === 'api'
            ? 'openapi.json'
            : mode === 'versions'
              ? 'manifest.json'
              : `guide-${language}.md`
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
    return (
        <PageHeaderShared
            title={t('documentation.title')}
            icon={<TbBook2 size={24} />}
            actions={
                <Group gap="xs">
                    <Button
                        component="a"
                        href={`${import.meta.env.BASE_URL}documentation/${download}`}
                        download
                        leftSection={<TbDownload size={16} />}
                        variant="default"
                        size="sm"
                    >
                        {mode === 'api'
                            ? t('documentation.downloadSpec')
                            : mode === 'versions'
                              ? t('documentation.downloadVersions')
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
    )
}

export function DocumentationToolbar({
    mode,
    children
}: {
    mode: DocumentationMode
    children?: ReactNode
}) {
    const { t, language } = useDocumentationTranslation()
    const [params, setParams] = useSearchParams()
    const items = [
        {
            mode: 'guide',
            to: ROUTES.DASHBOARD.DOCUMENTATION.GUIDE,
            label: t('documentation.guide'),
            icon: <TbBook2 size={17} />
        },
        {
            mode: 'api',
            to: ROUTES.DASHBOARD.DOCUMENTATION.API,
            label: t('documentation.api'),
            icon: <TbApi size={17} />
        },
        {
            mode: 'versions',
            to: ROUTES.DASHBOARD.DOCUMENTATION.VERSIONS,
            label: t('documentation.versions'),
            icon: <TbVersions size={17} />
        }
    ]
    return (
        <Box className={classes.toolbar}>
            <Group className={classes.tabs} gap={6}>
                {items.map((item) => (
                    <Button
                        key={item.mode}
                        component={Link}
                        to={`${item.to}?language=${language}`}
                        aria-current={mode === item.mode ? 'page' : undefined}
                        variant={mode === item.mode ? 'light' : 'subtle'}
                        leftSection={item.icon}
                    >
                        {item.label}
                    </Button>
                ))}
            </Group>
            {children}
            <Select
                className={classes.language}
                w={145}
                aria-label={t('documentation.language')}
                allowDeselect={false}
                value={language}
                onChange={(value) => {
                    const next = new URLSearchParams(params)
                    next.set('language', value ?? 'en')
                    setParams(next)
                }}
                data={[
                    { value: 'ru', label: 'Русский' },
                    { value: 'en', label: 'English' },
                    { value: 'fa', label: 'فارسی' },
                    { value: 'zh', label: '简体中文' }
                ]}
            />
        </Box>
    )
}

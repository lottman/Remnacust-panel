import type { DocManifest, DocLanguage } from './documentation.types'

import {
    Alert,
    Anchor,
    Box,
    Button,
    Group,
    Loader,
    Select,
    Table,
    Text,
    Title
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { TbApi, TbBook2, TbVersions } from 'react-icons/tb'
import { Link, useSearchParams } from 'react-router'

import { useGetRemnawaveMetadata } from '@shared/api/hooks'
import { ROUTES } from '@shared/constants'
import { Page } from '@shared/ui/page'
import { PageHeaderShared } from '@shared/ui/page-header/page-header.shared'

import classes from './documentation.module.css'

const labels = {
    ru: [
        'Версии и совместимость',
        'Компонент',
        'Remnacust',
        'База upstream',
        'Панель',
        'Нода',
        'Ядро Xray',
        'Текущая версия панели',
        'Версии Remnacust и upstream имеют независимую нумерацию. В таблице указана база этой сборки, а не обещание совместимости с любым более новым выпуском.',
        'Версии установленных нод и запущенного ядра смотрите в разделе «Ноды». Старые ноды не обновляются вместе с панелью автоматически.',
        'Наше ядро сохраняет расширения для политик хостов и тегов и отзыва устройств. Обычный Xray не гарантирует поддержку этих возможностей.',
        'Редактор JSON и WebAssembly-проверка собраны для этой версии нашего ядра.',
        'Исходники базы Xray',
        'Эта информация относится к установленной сборке.',
        'Старые ноды Remnawave',
        'Форматы запросов проверены по всем 47 тегам агента от 1.0.0 до 3.4.1. Панель выбирает API по версии: с 2.3 — сжатие и новый формат конфига, с 2.5 — массовые операции, с 2.7 — плагины и ресурсы системы. Старые ноды получают обычный JSON и отдельные запросы для пользователей.',
        'Ноды 1.0–1.4 используют HTTP. Подключайте их через защищённый туннель или закрытую сеть и разрешайте конкретные адреса и порты в REMNACUST_LEGACY_HTTP_NODES. Ошибка TLS не вызывает переход на HTTP. Отсутствующие показатели старой ноды отображаются как неизвестные.',
        'Недоступная нода не обрывает всю подписку. Защищённый хост выдаётся только после подтверждения доступа на доступной ноде. Жёсткие ограничения хостов и тегов и немедленный отзыв соединений устройства требуют нашего агента и ядра. Поддержка нового протокола зависит от установленного Xray.'
    ],
    en: [
        'Versions and compatibility',
        'Component',
        'Remnacust',
        'Upstream base',
        'Panel',
        'Node',
        'Xray core',
        'Current panel version',
        'Remnacust and upstream use independent version sequences. This table identifies the base of this build; it does not promise compatibility with every newer release.',
        'See Nodes for installed node and running core versions. Updating the panel does not automatically upgrade existing nodes.',
        'Our core preserves host and tag policies and device revocation. Stock Xray does not guarantee these capabilities.',
        'The JSON editor and WebAssembly validator target this version of our core.',
        'Xray base source',
        'This information describes the installed build.',
        'Older Remnawave nodes',
        'Request formats are tested against all 47 agent tags from 1.0.0 to 3.4.1. The panel selects the API by version: compression and wrapped config from 2.3, bulk operations from 2.5, and plugins and system metrics from 2.7. Older nodes receive plain JSON and individual user requests.',
        'Nodes 1.0–1.4 use HTTP. Connect them through a secure tunnel or private network and allow exact endpoints in REMNACUST_LEGACY_HTTP_NODES. TLS errors never trigger an HTTP fallback. Missing metrics are shown as unknown.',
        'An unavailable node does not abort the entire subscription. A protected host is issued only after access is acknowledged on an available node. Strict host and tag limits and immediate device connection revocation require our agent and core. Protocol support depends on the installed Xray.'
    ],
    fa: [
        'نسخه‌ها و سازگاری',
        'جزء',
        'Remnacust',
        'نسخه پایه upstream',
        'پنل',
        'نود',
        'هسته Xray',
        'نسخه فعلی پنل',
        'شماره نسخه Remnacust از upstream مستقل است. جدول، پایه این بیلد را نشان می‌دهد و سازگاری با همه نسخه‌های جدیدتر را تضمین نمی‌کند.',
        'نسخه نودهای نصب‌شده و هسته در حال اجرا را در بخش نودها ببینید. به‌روزرسانی پنل نودهای قبلی را خودکار به‌روز نمی‌کند.',
        'هسته ما سیاست‌های میزبان و تگ و لغو دسترسی دستگاه را حفظ می‌کند. Xray معمولی این قابلیت‌ها را تضمین نمی‌کند.',
        'ویرایشگر JSON و اعتبارسنج WebAssembly برای این نسخه از هسته ما ساخته شده‌اند.',
        'کد پایه Xray',
        'این اطلاعات مربوط به بیلد نصب‌شده است.',
        'نودهای قدیمی Remnawave',
        'قالب درخواست‌ها با هر ۴۷ تگ عامل از 1.0.0 تا 3.4.1 بررسی شده است. پنل API را بر اساس نسخه انتخاب می‌کند: فشرده‌سازی و قالب جدید تنظیمات از 2.3، عملیات گروهی از 2.5 و افزونه‌ها و آمار سیستم از 2.7. نودهای قدیمی JSON ساده و درخواست‌های جداگانه کاربران دریافت می‌کنند.',
        'نودهای 1.0 تا 1.4 از HTTP استفاده می‌کنند. آن‌ها را از طریق تونل امن یا شبکه خصوصی وصل کنید و نشانی و پورت دقیق را در REMNACUST_LEGACY_HTTP_NODES مجاز کنید. خطای TLS باعث تغییر به HTTP نمی‌شود. آمار ناموجود به صورت نامشخص نمایش داده می‌شود.',
        'در دسترس نبودن یک نود کل اشتراک را متوقف نمی‌کند. میزبان محافظت‌شده فقط پس از تأیید دسترسی در نود در دسترس ارائه می‌شود. محدودیت‌های سخت میزبان و تگ و قطع فوری اتصال دستگاه به عامل و هسته ما نیاز دارند. پشتیبانی پروتکل به Xray نصب‌شده بستگی دارد.'
    ],
    zh: [
        '版本与兼容性',
        '组件',
        'Remnacust',
        '上游基础版本',
        '面板',
        '节点',
        'Xray 内核',
        '当前面板版本',
        'Remnacust 与上游采用独立的版本编号。此表说明当前构建的基础版本，不保证与所有更新版本兼容。',
        '请在节点页面查看已安装节点及运行中内核的版本。更新面板不会自动更新现有节点。',
        '我们的内核保留主机和标签策略以及设备访问撤销功能。普通 Xray 不保证支持这些功能。',
        'JSON 编辑器和 WebAssembly 验证器针对我们的此版本内核构建。',
        'Xray 基础源码',
        '此信息描述已安装的构建。',
        '旧版 Remnawave 节点',
        '请求格式已根据 1.0.0 至 3.4.1 的全部 47 个代理标签进行测试。面板按版本选择 API：2.3 起支持压缩及新配置格式，2.5 起支持批量操作，2.7 起支持插件和系统指标。旧节点使用普通 JSON 和单用户请求。',
        '1.0 至 1.4 节点使用 HTTP。请通过安全隧道或私有网络连接，并在 REMNACUST_LEGACY_HTTP_NODES 中允许准确的地址和端口。TLS 错误不会触发 HTTP 回退。缺失的指标显示为未知。',
        '一个节点不可用不会中断整个订阅。受保护的主机仅在可用节点确认访问后才会提供。严格的主机及标签限制和立即断开设备连接需要我们的代理与内核。协议支持取决于所安装的 Xray。'
    ]
} satisfies Record<DocLanguage, string[]>

const patchTitles = {
    ru: 'Исправления из Remnawave',
    en: 'Fixes from Remnawave',
    fa: 'اصلاحات Remnawave',
    zh: '来自 Remnawave 的修复'
} satisfies Record<DocLanguage, string>

export function CompatibilityDocumentation() {
    const { t, i18n } = useTranslation()
    const [params, setParams] = useSearchParams()
    const requested = params.get('language') ?? i18n.resolvedLanguage ?? 'en'
    const lang =
        (Object.keys(labels) as DocLanguage[]).find((key) => requested.startsWith(key)) ?? 'en'
    const l = labels[lang]
    const { data: runtime } = useGetRemnawaveMetadata()
    const manifest = useQuery({
        queryKey: ['documentation', 'compatibility'],
        staleTime: Infinity,
        queryFn: async ({ signal }): Promise<DocManifest> => {
            const response = await fetch(`${import.meta.env.BASE_URL}documentation/manifest.json`, {
                signal
            })
            if (!response.ok) throw new Error('Documentation manifest unavailable')
            return response.json()
        }
    })
    const m = manifest.data
    return (
        <Page title={l[0]}>
            <PageHeaderShared title={l[0]} icon={<TbVersions size={24} />} />
            <Group className={classes.toolbar}>
                <Group className={classes.tabs} gap={6}>
                    <Button
                        component={Link}
                        to={ROUTES.DASHBOARD.DOCUMENTATION.GUIDE}
                        variant="subtle"
                        leftSection={<TbBook2 size={17} />}
                    >
                        {t('documentation.guide')}
                    </Button>
                    <Button
                        component={Link}
                        to={ROUTES.DASHBOARD.DOCUMENTATION.API}
                        variant="subtle"
                        leftSection={<TbApi size={17} />}
                    >
                        {t('documentation.api')}
                    </Button>
                    <Button
                        variant="light"
                        aria-current="page"
                        leftSection={<TbVersions size={17} />}
                    >
                        {l[0]}
                    </Button>
                </Group>
                <Select
                    w={145}
                    aria-label={t('documentation.language')}
                    allowDeselect={false}
                    value={lang}
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
            </Group>
            <Box className={classes.layout} lang={lang} dir={lang === 'fa' ? 'rtl' : 'ltr'}>
                <Box
                    component="nav"
                    className={classes.index}
                    aria-label={t('documentation.contents')}
                >
                    {[
                        ['versions', l[0]],
                        ['patches', patchTitles[lang]],
                        ['legacy-nodes', l[14]],
                        ['core-source', l[12]]
                    ].map(([id, label]) => (
                        <Anchor key={id} href={`#${id}`} className={classes.indexEntry}>
                            {label}
                        </Anchor>
                    ))}
                </Box>
                <Box className={classes.content}>
                    <Box component="article" className={`${classes.article} ${classes.prose}`}>
                        <Title order={1} className={classes.articleTitle} id="versions" mb="lg">
                            {l[0]}
                        </Title>
                        <Text mb="md">{l[8]}</Text>
                        {manifest.isPending ? (
                            <Loader size="sm" />
                        ) : manifest.isError ? (
                            <Alert color="red">
                                <Text>{t('documentation.error')}</Text>
                                <Button onClick={() => void manifest.refetch()}>
                                    {t('documentation.retry')}
                                </Button>
                            </Alert>
                        ) : (
                            m && (
                                <>
                                    <Text fw={600} mb="md">
                                        {l[7]}:{' '}
                                        <span dir="ltr">
                                            {runtime?.version ?? m.backendVersion}
                                        </span>
                                    </Text>
                                    <Table.ScrollContainer minWidth={0}>
                                        <Table
                                            withTableBorder
                                            withColumnBorders
                                            striped
                                            style={{
                                                tableLayout: 'fixed',
                                                overflowWrap: 'anywhere'
                                            }}
                                        >
                                            <Table.Thead>
                                                <Table.Tr>
                                                    {[l[1], l[2], l[3]].map((text) => (
                                                        <Table.Th key={text}>{text}</Table.Th>
                                                    ))}
                                                </Table.Tr>
                                            </Table.Thead>
                                            <Table.Tbody>
                                                <Table.Tr>
                                                    <Table.Td>{l[4]}</Table.Td>
                                                    <Table.Td>
                                                        {runtime?.version ?? m.backendVersion}
                                                    </Table.Td>
                                                    <Table.Td>
                                                        Remnawave {m.upstreamPanelVersion}
                                                    </Table.Td>
                                                </Table.Tr>
                                                <Table.Tr>
                                                    <Table.Td>{l[5]}</Table.Td>
                                                    <Table.Td>{m.nodeVersion}</Table.Td>
                                                    <Table.Td>
                                                        Remnawave Node {m.upstreamNodeVersion}
                                                    </Table.Td>
                                                </Table.Tr>
                                                <Table.Tr>
                                                    <Table.Td>{l[6]}</Table.Td>
                                                    <Table.Td>{m.coreVersion}</Table.Td>
                                                    <Table.Td>
                                                        Xray {m.upstreamCoreVersion}
                                                    </Table.Td>
                                                </Table.Tr>
                                            </Table.Tbody>
                                        </Table>
                                    </Table.ScrollContainer>
                                    {!!m.upstreamBackendPatches?.length && (
                                        <>
                                            <Text
                                                component="h2"
                                                id="patches"
                                                className={classes.section}
                                                fw={600}
                                            >
                                                {patchTitles[lang]}
                                            </Text>
                                            {m.upstreamBackendPatches.map((patch) => (
                                                <Text key={patch.commit} mt="sm">
                                                    <Anchor
                                                        href={`https://github.com/remnawave/backend/commit/${patch.commit}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        {patch.description[lang]}
                                                    </Anchor>
                                                    {' · '}
                                                    {patch.date}
                                                </Text>
                                            ))}
                                        </>
                                    )}
                                    <Text mt="md">
                                        {l[9]}{' '}
                                        <Anchor
                                            component={Link}
                                            to={ROUTES.DASHBOARD.MANAGEMENT.NODES}
                                        >
                                            {l[5]}
                                        </Anchor>
                                    </Text>
                                    <Text mt="md">{l[10]}</Text>
                                    <Text mt="md">{l[11]}</Text>
                                    <Text
                                        component="h2"
                                        id="legacy-nodes"
                                        className={classes.section}
                                        fw={600}
                                    >
                                        {l[14]}
                                    </Text>
                                    <Text mt="md">{l[15]}</Text>
                                    <Text mt="md">{l[16]}</Text>
                                    <Text mt="md">{l[17]}</Text>
                                    <Anchor
                                        id="core-source"
                                        mt="md"
                                        display="inline-block"
                                        href={`https://github.com/XTLS/Xray-core/tree/${m.upstreamCoreCommit}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {l[12]} · {m.upstreamCoreVersion}
                                    </Anchor>
                                    <Text mt="md" c="dimmed" size="sm">
                                        {l[13]}
                                    </Text>
                                </>
                            )
                        )}
                    </Box>
                </Box>
            </Box>
        </Page>
    )
}

export function compatibilityTabLabel(language: string) {
    const key =
        (Object.keys(labels) as DocLanguage[]).find((code) => language.startsWith(code)) ?? 'en'
    return labels[key][0]
}

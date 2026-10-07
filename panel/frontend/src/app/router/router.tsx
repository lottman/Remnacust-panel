import { lazyWithRecovery as lazy } from '@shared/utils/lazy-with-recovery'

const SupportPage = lazy(() =>
    import('@pages/dashboard/support/support.page').then((m) => ({ default: m.SupportPage }))
)

const DocumentationPage = lazy(() =>
    import('@pages/dashboard/documentation/documentation.page').then((m) => ({
        default: m.DocumentationPage
    }))
)

const LoginPage = lazy(() => import('@pages/auth/login').then((m) => ({ default: m.LoginPage })))
const Oauth2CallbackPage = lazy(() =>
    import('@pages/auth/oauth2-callback/oauth2-callback.page').then((m) => ({
        default: m.Oauth2CallbackPage
    }))
)
const ConfigProfilesPageConnector = lazy(() =>
    import('@pages/dashboard/config-profiles/connectors').then((m) => ({
        default: m.ConfigProfilesPageConnector
    }))
)
const ConfigProfileByUuidPageConnector = lazy(() =>
    import('@pages/dashboard/config-profiles/connectors/config-profile-by-uuid.page.connector').then(
        (m) => ({ default: m.ConfigProfileByUuidPageConnector })
    )
)
const ProfileCanvasesPage = lazy(() =>
    import('@pages/dashboard/config-profiles/connectors/profile-canvases.page').then((m) => ({
        default: m.ProfileCanvasesPage
    }))
)
const InfraBillingPageConnector = lazy(() =>
    import('@pages/dashboard/crm/infra-billing/connectors/infra-billing.page.connector').then(
        (m) => ({ default: m.InfraBillingPageConnector })
    )
)
const ExternalSquadsPageConnector = lazy(() =>
    import('@pages/dashboard/external-squads/connectors').then((m) => ({
        default: m.ExternalSquadsPageConnector
    }))
)
const HomePageConnector = lazy(() =>
    import('@pages/dashboard/home/connectors').then((m) => ({ default: m.HomePageConnector }))
)
const LimitsPage = lazy(() =>
    import('@pages/dashboard/limits/limits.page').then((m) => ({ default: m.LimitsPage }))
)
const HostsPageConnector = lazy(() =>
    import('@pages/dashboard/hosts/ui/connectors').then((m) => ({ default: m.HostsPageConnector }))
)
const HttpStatsPageConnector = lazy(() =>
    import('@pages/dashboard/http-stats/ui/connectors/http-stats.page.connector').then((m) => ({
        default: m.HttpStatsPageConnector
    }))
)
const HwidInspectorPageConnector = lazy(() =>
    import('@pages/dashboard/hwid-inspector/ui/connectors').then((m) => ({
        default: m.HwidInspectorPageConnector
    }))
)
const InternalSquadsPageConnector = lazy(() =>
    import('@pages/dashboard/internal-squads/connectors/internal-squads.page.connector').then(
        (m) => ({ default: m.InternalSquadsPageConnector })
    )
)
const NodePluginEditorPageConnector = lazy(() =>
    import('@pages/dashboard/node-plugins/ui/connectors/node-plugin-editor-page.connector').then(
        (m) => ({ default: m.NodePluginEditorPageConnector })
    )
)
const NodePluginsBasePageConnector = lazy(() =>
    import('@pages/dashboard/node-plugins/ui/connectors/node-plugins-base-page.connector').then(
        (m) => ({ default: m.NodePluginsBasePageConnector })
    )
)
const NodesMetricsPageConnector = lazy(() =>
    import('@pages/dashboard/nodes-metrics/ui/connectors').then((m) => ({
        default: m.NodesMetricsPageConnector
    }))
)
const NodesPageConnector = lazy(() =>
    import('@pages/dashboard/nodes/ui/connectors').then((m) => ({ default: m.NodesPageConnector }))
)
const OpenEntityPage = lazy(() =>
    import('@pages/dashboard/open-entity').then((m) => ({ default: m.OpenEntityPage }))
)
const QuickOpenPage = lazy(() =>
    import('@pages/dashboard/quick-open').then((m) => ({ default: m.QuickOpenPage }))
)
const RemnawaveSettingsConnector = lazy(() =>
    import('@pages/dashboard/remnawave-settings/connectors').then((m) => ({
        default: m.RemnawaveSettingsConnector
    }))
)
const BackupsPageConnector = lazy(() =>
    import('@pages/dashboard/backups/connectors/backups.page.connector').then((m) => ({
        default: m.BackupsPageConnector
    }))
)
const ResponseRulesPageConnector = lazy(() =>
    import('@pages/dashboard/response-rules/connectors/response-rules.page.connector').then(
        (m) => ({ default: m.ResponseRulesPageConnector })
    )
)
const SessionsExplorerPageConnector = lazy(() =>
    import('@pages/dashboard/sessions-explorer/ui/connectors/sessions-explorer.page.connector').then(
        (m) => ({ default: m.SessionsExplorerPageConnector })
    )
)
const SrhInspectorPageConnector = lazy(() =>
    import('@pages/dashboard/srh-inspector/ui/connectors').then((m) => ({
        default: m.SrhInspectorPageConnector
    }))
)
const StatisticNodesConnector = lazy(() =>
    import('@pages/dashboard/statistic-nodes/connectors').then((m) => ({
        default: m.StatisticNodesConnector
    }))
)
const SubpageConfigBasePageConnector = lazy(() =>
    import('@pages/dashboard/subpage-config/ui/connectors/subpage-config-base-page.connector').then(
        (m) => ({ default: m.SubpageConfigBasePageConnector })
    )
)
const SubpageConfigEditorPageConnector = lazy(() =>
    import('@pages/dashboard/subpage-config/ui/connectors/subpage-config-editor-page.connector').then(
        (m) => ({ default: m.SubpageConfigEditorPageConnector })
    )
)
const SubscriptionSettingsConnector = lazy(() =>
    import('@pages/dashboard/subscription-settings/connectors').then((m) => ({
        default: m.SubscriptionSettingsConnector
    }))
)
const TemplateBasePageConnector = lazy(() =>
    import('@pages/dashboard/templates/ui/connectors/template-base-page.connector').then((m) => ({
        default: m.TemplateBasePageConnector
    }))
)
const TemplateEditorPageConnector = lazy(() =>
    import('@pages/dashboard/templates/ui/connectors/template-editor-page.connector').then((m) => ({
        default: m.TemplateEditorPageConnector
    }))
)
const TorrentBlockerReportsPageConnector = lazy(() =>
    import('@pages/dashboard/torrent-blocker-reports/ui/connectors').then((m) => ({
        default: m.TorrentBlockerReportsPageConnector
    }))
)
const UsersPageConnector = lazy(() =>
    import('@pages/dashboard/users/ui/connectors').then((m) => ({ default: m.UsersPageConnector }))
)
import { NotFoundPageComponent } from '@pages/errors/4xx-error'
import { ErrorPageComponent } from '@pages/errors/5xx-error'
import {
    createBrowserRouter,
    createRoutesFromElements,
    Navigate,
    Route,
    RouterProvider
} from 'react-router'

import { ErrorBoundaryHoc } from '@shared/hocs/error-boundary'
import { AuthGuard } from '@shared/hocs/guards/auth-guard'

import { ROUTES } from '../../shared/constants'
import { AuthLayout } from '../layouts/auth'
const MainLayout = lazy(() =>
    import('../layouts/dashboard/main-layout/layout').then((m) => ({ default: m.MainLayout }))
)

const router = createBrowserRouter(
    createRoutesFromElements(
        <Route element={<ErrorBoundaryHoc FallbackComponent={ErrorPageComponent} />}>
            <Route element={<AuthLayout />} path={ROUTES.OAUTH2.ROOT}>
                <Route element={<Oauth2CallbackPage />} path={ROUTES.OAUTH2.ROOT} />
            </Route>
            <Route element={<AuthGuard />}>
                <Route element={<Navigate replace to={ROUTES.DASHBOARD.ROOT} />} path="/" />
                <Route element={<AuthLayout />} path={ROUTES.AUTH.ROOT}>
                    <Route element={<Navigate replace to={ROUTES.AUTH.LOGIN} />} index />
                    <Route element={<LoginPage />} path={ROUTES.AUTH.LOGIN} />
                </Route>

                <Route element={<MainLayout />} path={ROUTES.DASHBOARD.ROOT}>
                    <Route element={<Navigate replace to={ROUTES.DASHBOARD.HOME} />} index />
                    <Route element={<HomePageConnector />} path={ROUTES.DASHBOARD.HOME} />
                    <Route element={<SupportPage />} path={ROUTES.DASHBOARD.SUPPORT} />
                    <Route path={ROUTES.DASHBOARD.DOCUMENTATION.ROOT}>
                        <Route
                            index
                            element={<Navigate replace to={ROUTES.DASHBOARD.DOCUMENTATION.GUIDE} />}
                        />
                        <Route
                            path={ROUTES.DASHBOARD.DOCUMENTATION.GUIDE}
                            element={<DocumentationPage />}
                        />
                        <Route
                            path={ROUTES.DASHBOARD.DOCUMENTATION.API}
                            element={<DocumentationPage mode="api" />}
                        />
                    </Route>
                    <Route element={<OpenEntityPage />} path={ROUTES.DASHBOARD.OPEN_ENTITY} />

                    <Route path={ROUTES.DASHBOARD.MANAGEMENT.ROOT}>
                        <Route
                            element={<Navigate replace to={ROUTES.DASHBOARD.MANAGEMENT.USERS} />}
                            index
                        />
                        <Route
                            element={<UsersPageConnector />}
                            path={ROUTES.DASHBOARD.MANAGEMENT.USERS}
                        />
                        <Route element={<LimitsPage />} path={ROUTES.DASHBOARD.MANAGEMENT.LIMITS} />
                        <Route
                            element={<HostsPageConnector />}
                            path={ROUTES.DASHBOARD.MANAGEMENT.HOSTS}
                        />
                        <Route
                            element={<NodesPageConnector />}
                            path={ROUTES.DASHBOARD.MANAGEMENT.NODES}
                        />
                        <Route
                            element={<StatisticNodesConnector />}
                            path={ROUTES.DASHBOARD.MANAGEMENT.NODES_STATS}
                        />
                        <Route
                            element={<SubscriptionSettingsConnector />}
                            path={ROUTES.DASHBOARD.MANAGEMENT.SUBSCRIPTION_SETTINGS}
                        />
                        <Route
                            element={<ConfigProfilesPageConnector />}
                            path={ROUTES.DASHBOARD.MANAGEMENT.CONFIG_PROFILES}
                        />
                        <Route
                            element={<ProfileCanvasesPage />}
                            path={ROUTES.DASHBOARD.MANAGEMENT.PROFILE_CANVASES}
                        />
                        <Route
                            element={<ConfigProfileByUuidPageConnector />}
                            path={ROUTES.DASHBOARD.MANAGEMENT.CONFIG_PROFILE_CANVAS}
                        />
                        <Route
                            element={<ConfigProfileByUuidPageConnector />}
                            path={ROUTES.DASHBOARD.MANAGEMENT.CONFIG_PROFILE_BY_UUID}
                        />
                        <Route
                            element={<InternalSquadsPageConnector />}
                            path={ROUTES.DASHBOARD.MANAGEMENT.INTERNAL_SQUADS}
                        />
                        <Route
                            element={<ExternalSquadsPageConnector />}
                            path={ROUTES.DASHBOARD.MANAGEMENT.EXTERNAL_SQUADS}
                        />

                        <Route
                            element={<NodesMetricsPageConnector />}
                            path={ROUTES.DASHBOARD.MANAGEMENT.NODES_METRICS}
                        />
                        <Route
                            element={<ResponseRulesPageConnector />}
                            path={ROUTES.DASHBOARD.MANAGEMENT.RESPONSE_RULES}
                        />
                        <Route
                            element={<BackupsPageConnector />}
                            path={ROUTES.DASHBOARD.MANAGEMENT.BACKUPS}
                        />

                        <Route
                            element={<RemnawaveSettingsConnector />}
                            path={ROUTES.DASHBOARD.MANAGEMENT.REMNAWAVE_SETTINGS}
                        />

                        <Route path={ROUTES.DASHBOARD.MANAGEMENT.NODE_PLUGINS.ROOT}>
                            <Route element={<NodePluginsBasePageConnector />} index />

                            <Route
                                element={<NodePluginEditorPageConnector />}
                                path={ROUTES.DASHBOARD.MANAGEMENT.NODE_PLUGINS.NODE_PLUGIN_BY_UUID}
                            />
                        </Route>
                    </Route>

                    <Route path={ROUTES.DASHBOARD.TOOLS.ROOT}>
                        <Route
                            element={<HwidInspectorPageConnector />}
                            path={ROUTES.DASHBOARD.TOOLS.HWID_INSPECTOR}
                        />
                        <Route
                            element={<SrhInspectorPageConnector />}
                            path={ROUTES.DASHBOARD.TOOLS.SRH_INSPECTOR}
                        />

                        <Route
                            element={<TorrentBlockerReportsPageConnector />}
                            path={ROUTES.DASHBOARD.TOOLS.TORRENT_BLOCKER_REPORTS}
                        />
                        <Route
                            element={<SessionsExplorerPageConnector />}
                            path={ROUTES.DASHBOARD.TOOLS.SESSIONS_EXPLORER}
                        />
                        <Route
                            element={<HttpStatsPageConnector />}
                            path={ROUTES.DASHBOARD.TOOLS.HTTP_STATS}
                        />
                        <Route
                            element={<QuickOpenPage />}
                            path={ROUTES.DASHBOARD.TOOLS.QUICK_OPEN}
                        />
                    </Route>

                    <Route path={ROUTES.DASHBOARD.TEMPLATES.ROOT}>
                        <Route
                            element={<TemplateBasePageConnector />}
                            path={ROUTES.DASHBOARD.TEMPLATES.TEMPLATES_BY_TYPE}
                        />

                        <Route
                            element={<TemplateEditorPageConnector />}
                            path={ROUTES.DASHBOARD.TEMPLATES.TEMPLATE_EDITOR}
                        />
                    </Route>

                    <Route path={ROUTES.DASHBOARD.SUBPAGE_CONFIGS.ROOT}>
                        <Route element={<SubpageConfigBasePageConnector />} index />

                        <Route
                            element={<SubpageConfigEditorPageConnector />}
                            path={ROUTES.DASHBOARD.SUBPAGE_CONFIGS.SUBPAGE_CONFIG_BY_UUID}
                        />
                    </Route>

                    <Route path={ROUTES.DASHBOARD.CRM.ROOT}>
                        <Route
                            element={<InfraBillingPageConnector />}
                            path={ROUTES.DASHBOARD.CRM.INFRA_BILLING}
                        />
                    </Route>
                </Route>

                <Route element={<NotFoundPageComponent />} path="*" />
            </Route>
        </Route>
    )
)

export function Router() {
    return <RouterProvider router={router} />
}

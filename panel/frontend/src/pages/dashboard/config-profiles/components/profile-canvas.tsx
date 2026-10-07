import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Loader,
    SegmentedControl,
    Text,
    TextInput,
    Tooltip
} from '@mantine/core'
import {
    GetConfigProfileByUuidCommand,
    GetSubscriptionTemplateCommand
} from '@remnawave/backend-contract'
import { useQueries } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
    TbArrowsMaximize,
    TbArrowsMinimize,
    TbFocusCentered,
    TbMinus,
    TbPlugConnected,
    TbPlus,
    TbSearch,
    TbServer,
    TbSitemap,
    TbUsers,
    TbWorld
} from 'react-icons/tb'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'

import { showModal } from '@shared/_modals/show-modal'
import { instance } from '@shared/api/axios'
import {
    useGetHosts,
    useGetInternalSquads,
    useGetNodes,
    useGetSubscriptionTemplates,
    useGetTrafficPaths
} from '@shared/api/hooks'
import { useUiText } from '@shared/i18n/interface-text'

import { record, values, stringValue, xrayRouting, type XrayRule } from './profile-canvas-config'
import { createCanvasPaths } from './profile-canvas-routing'
import classes from './profile-canvas.module.css'

type Profile = GetConfigProfileByUuidCommand.Response['response']
type Snippet = { name: string; snippet: unknown }
type Kind =
    | 'client'
    | 'clientProfile'
    | 'host'
    | 'squad'
    | 'profile'
    | 'inbound'
    | 'node'
    | 'rule'
    | 'balancer'
    | 'outbound'
    | 'internet'
type Item = {
    id: string
    kind: Kind
    title: string
    detail: string
    x: number
    y: number
    uuid: string
    outcome?: 'blocked' | 'direct' | 'forwarded'
    facts?: string[]
}
type Link = { from: string; to: string; kind: Kind }

const cardWidth = 232
const cardHeight = 72
const column: Record<Kind, number> = {
    client: 40,
    clientProfile: 340,
    host: 640,
    squad: 940,
    profile: 1240,
    inbound: 1540,
    node: 1840,
    rule: 1540,
    balancer: 1840,
    outbound: 2140,
    internet: 2440
}
const graphWidth = 3112

function fallbackRoute(outboundTag: string): XrayRule {
    return {
        inboundTag: [],
        outboundTag,
        domain: [],
        ip: [],
        port: '',
        network: '',
        protocol: [],
        balancerTag: '',
        ruleTag: '',
        sourceIP: [],
        localIP: [],
        user: [],
        process: [],
        sourcePort: '',
        localPort: '',
        vlessRoute: '',
        attrs: [],
        fallback: true
    }
}

function useCanvasPaths(layout: string, connections: string) {
    return useMemo(() => createCanvasPaths(layout, connections), [layout, connections])
}

export function ProfileCanvas({
    profile,
    snippets,
    onOpenEditor
}: {
    profile: Profile
    snippets: Snippet[]
    onOpenEditor?: () => void
}) {
    const uiText = useUiText()

    const {
        data: nodes,
        isLoading: nodesLoading,
        isError: nodesError,
        refetch: refetchNodes
    } = useGetNodes()
    const {
        data: hosts,
        isLoading: hostsLoading,
        isError: hostsError,
        refetch: refetchHosts
    } = useGetHosts()
    const {
        data: squads,
        isLoading: squadsLoading,
        isError: squadsError,
        refetch: refetchSquads
    } = useGetInternalSquads()
    const { data: templates } = useGetSubscriptionTemplates()
    const usedTemplateUuids = Array.from(
        new Set(
            (hosts ?? [])
                .filter((host) => host.inbound?.configProfileUuid === profile.uuid)
                .map((host) => host.xrayJsonTemplateUuid)
                .filter((uuid): uuid is string => Boolean(uuid))
        )
    )
    const templateDetails = useQueries({
        queries: usedTemplateUuids.map((uuid) => ({
            queryKey: ['profile-canvas-template', uuid],
            queryFn: async () => {
                const response = await instance.get(
                    GetSubscriptionTemplateCommand.TSQ_url.replace(':uuid', uuid)
                )
                return GetSubscriptionTemplateCommand.ResponseSchema.parse(response.data).response
            },
            staleTime: 60_000
        }))
    })
    const clientTemplateByUuid = new Map(
        usedTemplateUuids.map((uuid, index) => [uuid, templateDetails[index]?.data])
    )
    const [clientInput, setClientInput] = useState('')
    const [clientShortUuid, setClientShortUuid] = useState('')
    const {
        data: clientPaths,
        isLoading: clientPathsLoading,
        isError: clientPathsError
    } = useGetTrafficPaths({
        query: { userShortUuid: clientShortUuid || undefined },
        rQueryParams: { enabled: !!clientShortUuid, refetchOnWindowFocus: false }
    })
    const [selectedId, setSelectedId] = useState('client')
    const [search, setSearch] = useState('')
    const [fullscreen, setFullscreen] = useState(false)
    const [viewMode, setViewMode] = useState<'all' | 'access' | 'routing'>('all')
    const miniViewportRef = useRef<SVGRectElement>(null)
    const canvasRef = useRef<HTMLDivElement>(null)
    const [canvasViewport, setCanvasViewport] = useState({ width: 0, height: 0 })
    const zoomLabelRef = useRef<HTMLSpanElement>(null)
    const transformSetter = useRef<
        ((x: number, y: number, scale: number, animationTime?: number) => void) | null
    >(null)
    const transformState = useRef({ scale: 0.78, x: 0, y: 0 })

    useEffect(() => {
        if (!fullscreen) return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setFullscreen(false)
        }
        window.addEventListener('keydown', onKeyDown)
        return () => {
            window.removeEventListener('keydown', onKeyDown)
            document.body.style.overflow = previousOverflow
        }
    }, [fullscreen])

    const inboundIds = new Set(profile.inbounds.map((inbound) => inbound.uuid))
    const relatedHosts =
        hosts?.filter((host) => host.inbound?.configProfileUuid === profile.uuid) ?? []
    const clientTemplateUuids = Array.from(
        new Set(relatedHosts.map((host) => host.xrayJsonTemplateUuid ?? 'default'))
    )
    const relatedNodes =
        nodes?.filter(
            (node) =>
                node.configProfile.activeConfigProfileUuid === profile.uuid ||
                relatedHosts.some((host) => host.nodes.includes(node.uuid))
        ) ?? []
    const relatedSquads =
        squads?.internalSquads.filter((squad) =>
            squad.inbounds.some((inbound) => inboundIds.has(inbound.uuid))
        ) ?? []
    const verifiedClientPaths =
        clientPaths?.user?.shortUuid === clientShortUuid ? clientPaths : undefined
    const clientHosts =
        verifiedClientPaths?.hosts.filter(
            (host) => host.profileUuid === profile.uuid && !host.isDisabled && !host.isHidden
        ) ?? []
    const clientHostIds = new Set(clientHosts.map((host) => host.uuid))
    const clientSquadIds = new Set(verifiedClientPaths?.user?.activeInternalSquadUuids ?? [])
    const { outbounds, rules, balancers, domainStrategy, observation, unresolvedSnippets } =
        useMemo(() => xrayRouting(profile.config, snippets), [profile.config, snippets])
    const routes: XrayRule[] = outbounds.length
        ? [...rules, fallbackRoute(outbounds[0].tag)]
        : rules
    const templateName = (uuid: string | null) =>
        uuid ? templates?.templates.find((template) => template.uuid === uuid)?.name : undefined
    const ruleLabel = (rule: XrayRule) =>
        rule.fallback
            ? uiText('otherwise-first-outbound-73e387d')
            : rule.ruleTag ||
              [
                  ...rule.domain,
                  ...rule.ip,
                  ...rule.protocol,
                  rule.port,
                  rule.network,
                  rule.vlessRoute ? `vlessRoute: ${rule.vlessRoute}` : '',
                  rule.sourcePort ? `sourcePort: ${rule.sourcePort}` : '',
                  rule.localPort ? `localPort: ${rule.localPort}` : '',
                  ...rule.sourceIP,
                  ...rule.localIP,
                  ...rule.user,
                  ...rule.process,
                  ...rule.attrs
              ].find(Boolean) ||
              rule.inboundTag[0] ||
              uiText('rule-without-conditions-39a0a61')
    const policyTop = Math.max(
        340,
        180 + Math.max(profile.inbounds.length, relatedNodes.length) * 102
    )
    let nextTemplateRouteY =
        policyTop + Math.max(routes.length, outbounds.length, balancers.length, 1) * 102 + 140
    const clientTemplateFlows = clientTemplateUuids.flatMap((uuid) => {
        const template = clientTemplateByUuid.get(uuid)
        if (!template?.templateJson) return []
        const routing = xrayRouting(template.templateJson, snippets)
        const flowRoutes = routing.outbounds.length
            ? [...routing.rules, fallbackRoute(routing.outbounds[0].tag)]
            : routing.rules
        const rowCount = Math.max(
            flowRoutes.length,
            routing.balancers.length,
            routing.outbounds.length,
            1
        )
        const flow = {
            uuid,
            routes: flowRoutes,
            outbounds: routing.outbounds,
            balancers: routing.balancers,
            y: nextTemplateRouteY
        }
        nextTemplateRouteY += rowCount * 102 + 36
        return [flow]
    })
    const height = Math.max(
        620,
        policyTop + Math.max(routes.length, outbounds.length, balancers.length, 1) * 102 + 90,
        150 + Math.max(relatedHosts.length, relatedSquads.length) * 102,
        160 + clientTemplateUuids.length * 124,
        nextTemplateRouteY + 90
    )
    const items: Item[] = [
        {
            id: 'client',
            kind: 'client',
            title: verifiedClientPaths?.user?.username ?? uiText('client-0c77fe0'),
            detail:
                verifiedClientPaths?.user?.status ??
                (clientShortUuid
                    ? uiText('access-pending-or-unverified-91dc6c8')
                    : uiText('illustrative-device-using-subscription-00e0d5b')),
            x: column.client,
            y: 60,
            uuid: '',
            facts: verifiedClientPaths?.user
                ? [
                      `${uiText('status-920e413')}: ${verifiedClientPaths.user.status}`,
                      `${uiText('visible-enabled-hosts-693ffb2')}: ${clientHosts.length}`,
                      verifiedClientPaths.user.expireAt
                          ? `${uiText('expires-f6725f3')}: ${new Date(verifiedClientPaths.user.expireAt).toLocaleString()}`
                          : ''
                  ].filter(Boolean)
                : [
                      clientShortUuid
                          ? uiText('client-links-appear-only-after-access-is-verified-4c01a81')
                          : uiText(
                                'illustrative-client-enter-a-short-id-to-inspect-accessible-hos-6742ba7'
                            )
                  ]
        },
        ...clientTemplateUuids.map((templateUuid, index) => {
            const template = clientTemplateByUuid.get(templateUuid)
            const templateRouting = template?.templateJson
                ? xrayRouting(template.templateJson, snippets)
                : null
            const outboundSummary = templateRouting?.outbounds
                .map((outbound) => `${outbound.tag} (${outbound.protocol})`)
                .join(', ')
            const ruleSummary = templateRouting?.rules
                .map((rule) => {
                    const target = rule.outboundTag || rule.balancerTag
                    return target ? `${ruleLabel(rule)} → ${target}` : ruleLabel(rule)
                })
                .join('; ')

            return {
                id: `template-${templateUuid}`,
                kind: 'clientProfile' as const,
                title:
                    templateUuid === 'default'
                        ? uiText('default-template-0b1bdec')
                        : (templateName(templateUuid) ?? templateUuid),
                detail:
                    templateUuid === 'default'
                        ? uiText('default-subscription-format-c8f5f80')
                        : 'XRAY_JSON',
                x: column.clientProfile,
                y: 60 + index * 124,
                uuid: templateUuid,
                facts: [
                    `${uiText('hosts-using-template-c4bb011')}: ${relatedHosts.filter((host) => (host.xrayJsonTemplateUuid ?? 'default') === templateUuid).length}`,
                    templateUuid === 'default'
                        ? uiText('host-uses-the-default-subscription-settings-5faa262')
                        : `XRAY_JSON: ${templateName(templateUuid) ?? templateUuid}`,
                    outboundSummary
                        ? `${uiText('client-profile-outbounds-13e1b05')}: ${outboundSummary}`
                        : templateUuid !== 'default' && !template
                          ? uiText('loading-this-client-profile-s-outbounds-and-routes-0fc4a62')
                          : '',
                    ruleSummary ? `${uiText('client-profile-routes-f64f6b4')}: ${ruleSummary}` : ''
                ].filter(Boolean)
            }
        }),
        ...clientTemplateFlows.flatMap((flow) =>
            flow.routes.map((rule, index) => {
                const target = rule.outboundTag || rule.balancerTag
                const matchedOutbound = flow.outbounds.find(
                    (outbound) => outbound.tag === rule.outboundTag
                )
                return {
                    id: `client-template-rule-${flow.uuid}-${index}`,
                    kind: 'rule' as const,
                    title: ruleLabel(rule),
                    detail: `${rule.fallback ? uiText('no-rule-matched-105129d') : `#${index + 1}`} → ${target || '—'}`,
                    x: column.rule,
                    y: flow.y + index * 102,
                    uuid: `${flow.uuid}:${index}`,
                    facts: [
                        `${uiText('client-template-a8cd9ea')}: ${templateName(flow.uuid) ?? flow.uuid}`,
                        ...rule.domain.map((value) => `domain: ${value}`),
                        ...rule.ip.map((value) => `ip: ${value}`),
                        ...rule.protocol.map((value) => `protocol: ${value}`),
                        rule.port ? `port: ${rule.port}` : '',
                        rule.network ? `network: ${rule.network}` : '',
                        rule.outboundTag ? `outboundTag: ${rule.outboundTag}` : '',
                        rule.balancerTag ? `balancerTag: ${rule.balancerTag}` : ''
                    ].filter(Boolean),
                    outcome:
                        matchedOutbound?.protocol === 'blackhole'
                            ? ('blocked' as const)
                            : matchedOutbound?.protocol === 'freedom'
                              ? ('direct' as const)
                              : ('forwarded' as const)
                }
            })
        ),
        ...relatedHosts.map((host, index) => ({
            id: `host-${host.uuid}`,
            kind: 'host' as const,
            title: host.remark,
            detail: `${host.address}:${host.port}${host.isDisabled ? uiText('disabled-79fb364') : ''}`,
            x: column.host,
            y: 60 + index * 102,
            uuid: host.uuid,
            facts: [
                `${uiText('client-template-a8cd9ea')}: ${templateName(host.xrayJsonTemplateUuid) ?? uiText('default-37a8eec')}`,
                `${uiText('subscription-host-5f3e4ca')}: ${host.remark}`,
                `${uiText('address-56ef8f2')}: ${host.address}:${host.port}`,
                `${uiText('inbound-d17a5bd')}: ${profile.inbounds.find((inbound) => inbound.uuid === host.inbound.configProfileInboundUuid)?.tag ?? '—'}`,
                `${uiText('state-a3b50c4')}: ${host.isDisabled ? uiText('disabled-17eb3c0') : uiText('enabled-fb9cf75')}`,
                `${uiText('in-subscription-a4d7dfe')}: ${host.isHidden ? uiText('hidden-e564b40') : uiText('visible-d42ef14')}`,
                `${uiText('host-nodes-b17b61e')}: ${host.nodes.map((uuid) => relatedNodes.find((node) => node.uuid === uuid)?.name ?? uuid).join(', ') || '—'}`,
                host.sni ? `SNI: ${host.sni}` : '',
                host.path ? `${uiText('path-62fa5a5')}: ${host.path}` : '',
                templateName(host.xrayJsonTemplateUuid)
                    ? `XRAY_JSON: ${templateName(host.xrayJsonTemplateUuid)}`
                    : '',
                host.domainRules?.mode && host.domainRules.mode !== 'OFF'
                    ? `${uiText('host-domain-rules-0c0ad3c')}: ${host.domainRules.mode} · ${host.domainRules.domains.join(', ')}`
                    : '',
                host.speedLimitMbps
                    ? `${uiText('brutal-target-speed-56b4f37')}: ${host.speedLimitMbps} Mbps`
                    : ''
            ].filter(Boolean)
        })),
        ...relatedSquads.map((squad, index) => ({
            id: `squad-${squad.uuid}`,
            kind: 'squad' as const,
            title: squad.name,
            detail: uiText('accessible-inbounds-value-cded6a4', { value1: squad.inbounds.length }),
            x: column.squad,
            y: 60 + index * 102,
            uuid: squad.uuid,
            facts: [
                `${uiText('inbounds-from-this-profile-711baf6')}: ${
                    squad.inbounds
                        .filter((inbound) => inboundIds.has(inbound.uuid))
                        .map((inbound) => inbound.tag)
                        .join(', ') || '—'
                }`,
                uiText('the-squad-grants-access-to-its-assigned-users-d287010')
            ]
        })),
        {
            id: `profile-${profile.uuid}`,
            kind: 'profile',
            title: profile.name,
            detail: uiText('config-profile-ee4e7b6'),
            x: column.profile,
            y: 60,
            uuid: profile.uuid,
            facts: [
                `${uiText('inbounds-ccb7185')}: ${profile.inbounds.length}`,
                `${uiText('nodes-7ac3620')}: ${relatedNodes.length}`,
                `${uiText('rules-4228aeb')}: ${rules.length}`,
                `${uiText('outbounds-4788f08')}: ${outbounds.length}`,
                `domainStrategy: ${domainStrategy}`,
                ...observation,
                `${uiText('config-sections-f9feceb')}: ${Object.keys(record(profile.config) ?? {}).join(', ') || '—'}`,
                profile.tags?.length ? `${uiText('tags-1331275')}: ${profile.tags.join(', ')}` : ''
            ]
        },
        ...profile.inbounds.map((inbound, index) => ({
            id: `inbound-${inbound.uuid}`,
            kind: 'inbound' as const,
            title: inbound.tag,
            detail: `${inbound.type}${inbound.port ? ` · ${inbound.port}` : ''}`,
            x: column.inbound,
            y: 60 + index * 102,
            uuid: inbound.uuid,
            facts: [
                `${uiText('type-baaddf7')}: ${inbound.type}`,
                `${uiText('port-72e9a59')}: ${inbound.port ?? '—'}`,
                `${uiText('network-1744b96')}: ${inbound.network ?? '—'}`,
                `${uiText('security-8f6fb4e')}: ${inbound.security ?? '—'}`,
                stringValue(record(inbound.rawInbound)?.listen)
                    ? `listen: ${stringValue(record(inbound.rawInbound)?.listen)}`
                    : '',
                record(record(inbound.rawInbound)?.sniffing)?.enabled === true
                    ? `${uiText('sniffing-9b17029')}: on · ${values(record(record(inbound.rawInbound)?.sniffing)?.destOverride).join(', ')}`
                    : '',
                `${uiText('active-on-nodes-21240c8')}: ${
                    relatedNodes
                        .filter((node) =>
                            node.configProfile.activeInbounds.some(
                                (active) => active.uuid === inbound.uuid
                            )
                        )
                        .map((node) => node.name)
                        .join(', ') || '—'
                }`,
                `${uiText('hosts-bba9af1')}: ${relatedHosts.filter((host) => host.inbound.configProfileInboundUuid === inbound.uuid).length}`,
                `${uiText('squads-258027a')}: ${relatedSquads.filter((squad) => squad.inbounds.some((allowed) => allowed.uuid === inbound.uuid)).length}`
            ]
        })),
        ...relatedNodes.map((node, index) => ({
            id: `node-${node.uuid}`,
            kind: 'node' as const,
            title: node.name,
            detail: `${node.countryCode} · ${
                node.ips
                    .filter((ip) => ip.status === 'OUTBOUND')
                    .map((ip) => ip.ip)
                    .join(', ') || uiText('exit-ip-not-listed-9848d0f')
            }`,
            x: column.node,
            y: 60 + index * 102,
            uuid: node.uuid,
            facts: [
                `${uiText('profile-relation-848c037')}: ${node.configProfile.activeConfigProfileUuid === profile.uuid ? uiText('assigned-directly-3cf81d0') : uiText('listed-by-host-profile-not-assigned-70630de')}`,
                `${uiText('state-a3b50c4')}: ${node.isDisabled ? uiText('disabled-17eb3c0') : node.isConnected ? 'online' : 'offline'}`,
                `${uiText('address-56ef8f2')}: ${node.address}`,
                `${uiText('inbound-ips-2dcc83e')}: ${
                    node.ips
                        .filter((ip) => ip.status === 'INBOUND')
                        .map((ip) => ip.ip)
                        .join(', ') || '—'
                }`,
                `${uiText('outbound-ips-fda66c2')}: ${
                    node.ips
                        .filter((ip) => ip.status === 'OUTBOUND')
                        .map((ip) => ip.ip)
                        .join(', ') || '—'
                }`,
                `${uiText('active-inbounds-9d8a08c')}: ${node.configProfile.activeInbounds.map((inbound) => inbound.tag).join(', ') || '—'}`,
                node.provider?.name ? `${uiText('provider-472590a')}: ${node.provider.name}` : ''
            ].filter(Boolean)
        })),
        ...routes.map((rule, index) => ({
            id: `rule-${index}`,
            kind: 'rule' as const,
            title: ruleLabel(rule),
            detail: `${rule.fallback ? uiText('no-rule-matched-105129d') : `#${index + 1}`} → ${rule.outboundTag || rule.balancerTag}`,
            x: column.rule,
            y: policyTop + index * 102,
            uuid: String(index),
            facts: [
                rule.fallback
                    ? uiText('used-when-no-earlier-rule-matches-e9bc9a6')
                    : `${uiText('evaluation-order-8c0c5f6')}: ${index + 1}`,
                ...rule.domain.map((value) => `domain: ${value}`),
                ...rule.ip.map((value) => `ip: ${value}`),
                ...rule.inboundTag.map((value) => `inboundTag: ${value}`),
                ...rule.sourceIP.map((value) => `sourceIP: ${value}`),
                ...rule.localIP.map((value) => `localIP: ${value}`),
                ...rule.user.map((value) => `user: ${value}`),
                ...rule.process.map((value) => `process: ${value}`),
                ...rule.protocol.map((value) => `protocol: ${value}`),
                ...rule.attrs.map((value) => `attrs: ${value}`),
                rule.port ? `port: ${rule.port}` : '',
                rule.sourcePort ? `sourcePort: ${rule.sourcePort}` : '',
                rule.localPort ? `localPort: ${rule.localPort}` : '',
                rule.network ? `network: ${rule.network}` : '',
                rule.vlessRoute ? `vlessRoute: ${rule.vlessRoute}` : '',
                rule.balancerTag ? `balancerTag: ${rule.balancerTag}` : '',
                rule.outboundTag ? `outboundTag: ${rule.outboundTag}` : ''
            ].filter(Boolean),
            outcome:
                outbounds.find((outbound) => outbound.tag === rule.outboundTag)?.protocol ===
                'blackhole'
                    ? ('blocked' as const)
                    : outbounds.find((outbound) => outbound.tag === rule.outboundTag)?.protocol ===
                        'freedom'
                      ? ('direct' as const)
                      : ('forwarded' as const)
        })),
        ...balancers.map((balancer, index) => ({
            id: `balancer-${index}`,
            kind: 'balancer' as const,
            title: balancer.tag,
            detail: uiText('selects-outbound-by-prefix-7ef6b10'),
            x: column.balancer,
            y: policyTop + index * 102,
            uuid: String(index),
            facts: [
                `strategy: ${balancer.strategy}`,
                `${uiText('outbound-prefixes-4cdbd5b')}: ${balancer.selectors.join(', ') || '—'}`,
                `${uiText('fallback-outbound-25be968')}: ${balancer.fallbackTag || '—'}`,
                uiText('the-selected-outbound-depends-on-balancer-state-e104f25')
            ]
        })),
        ...clientTemplateFlows.flatMap((flow) =>
            flow.balancers.map((balancer, index) => ({
                id: `client-template-balancer-${flow.uuid}-${index}`,
                kind: 'balancer' as const,
                title: balancer.tag,
                detail: uiText('client-profile-balancer-70c7415'),
                x: column.balancer,
                y: flow.y + index * 102,
                uuid: `${flow.uuid}:${index}`,
                facts: [
                    `${uiText('client-template-a8cd9ea')}: ${templateName(flow.uuid) ?? flow.uuid}`,
                    `strategy: ${balancer.strategy}`,
                    `${uiText('outbound-prefixes-4cdbd5b')}: ${balancer.selectors.join(', ') || '—'}`,
                    `${uiText('fallback-outbound-25be968')}: ${balancer.fallbackTag || '—'}`
                ]
            }))
        ),
        ...outbounds.map((outbound, index) => ({
            id: `outbound-${index}`,
            kind: 'outbound' as const,
            title: outbound.tag,
            detail:
                outbound.protocol === 'freedom'
                    ? uiText('direct-exits-from-node-5b4fc83')
                    : outbound.protocol === 'blackhole'
                      ? uiText('block-traffic-dropped-42367b8')
                      : `${outbound.protocol}${outbound.destination ? ` → ${outbound.destination}` : ''}`,
            x: column.outbound,
            y: policyTop + index * 102,
            uuid: String(index),
            facts: [
                `${uiText('protocol-cf08833')}: ${outbound.protocol}`,
                outbound.destination ? `${uiText('server-aef7de2')}: ${outbound.destination}` : '',
                outbound.redirect ? `redirect: ${outbound.redirect}` : '',
                outbound.dialerProxy ? `dialerProxy: ${outbound.dialerProxy}` : '',
                outbound.finalRules
                    ? `${uiText('freedom-final-rules-1e94bd8')}: ${outbound.finalRules}`
                    : '',
                ...outbound.finalRuleDetails,
                outbound.response
                    ? `${uiText('block-response-43a0e8f')}: ${outbound.response}`
                    : '',
                `${uiText('explicit-rules-703ff35')}: ${rules.filter((rule) => rule.outboundTag === outbound.tag).length}`,
                index === 0 ? uiText('first-outbound-used-if-no-rules-match-94443f0') : ''
            ].filter(Boolean),
            outcome:
                outbound.protocol === 'blackhole'
                    ? ('blocked' as const)
                    : outbound.protocol === 'freedom'
                      ? ('direct' as const)
                      : ('forwarded' as const)
        })),
        ...outbounds.map((outbound, index) => ({
            id: `outcome-${index}`,
            kind: 'internet' as const,
            title:
                outbound.protocol === 'blackhole'
                    ? uiText('blocked-18f2a09')
                    : outbound.protocol === 'freedom'
                      ? uiText('direct-002c7c6')
                      : uiText('forwarded-to-outbound-04ff29e'),
            detail:
                outbound.protocol === 'blackhole'
                    ? uiText('connection-dropped-9049f3d')
                    : outbound.protocol === 'freedom'
                      ? uiText('to-destination-from-node-ip-b219404')
                      : `${outbound.protocol}${outbound.destination ? ` → ${outbound.destination}` : ''}`,
            x: column.internet,
            y: policyTop + index * 102,
            uuid: String(index),
            facts: [
                `${uiText('outbound-0277321')}: ${outbound.tag}`,
                outbound.protocol === 'blackhole'
                    ? uiText('traffic-is-dropped-by-xray-blackhole-c0aa93d')
                    : outbound.protocol === 'freedom'
                      ? uiText(
                            'the-node-dials-out-actual-ip-and-destination-depend-on-network-6c6ab19'
                        )
                      : uiText(
                            'traffic-is-handed-to-this-outbound-the-final-address-is-not-me-671eee5'
                        ),
                outbound.finalRules
                    ? uiText('additional-finalrules-may-block-a-direct-connection-08be6b6')
                    : ''
            ].filter(Boolean),
            outcome:
                outbound.protocol === 'blackhole'
                    ? ('blocked' as const)
                    : outbound.protocol === 'freedom'
                      ? ('direct' as const)
                      : ('forwarded' as const)
        })),
        ...clientTemplateFlows.flatMap((flow) =>
            flow.outbounds.map((outbound, index) => ({
                id: `client-template-outbound-${flow.uuid}-${index}`,
                kind: 'outbound' as const,
                title: outbound.tag,
                detail:
                    outbound.protocol === 'freedom'
                        ? 'DIRECT · client exits directly'
                        : outbound.protocol === 'blackhole'
                          ? 'BLOCK · traffic dropped'
                          : `${outbound.protocol}${outbound.destination ? ` → ${outbound.destination}` : ''}`,
                x: column.outbound,
                y: flow.y + index * 102,
                uuid: `${flow.uuid}:${index}`,
                facts: [
                    `${uiText('client-template-a8cd9ea')}: ${templateName(flow.uuid) ?? flow.uuid}`,
                    `${uiText('protocol-cf08833')}: ${outbound.protocol}`,
                    outbound.destination
                        ? `${uiText('server-aef7de2')}: ${outbound.destination}`
                        : '',
                    outbound.redirect ? `redirect: ${outbound.redirect}` : '',
                    outbound.dialerProxy ? `dialerProxy: ${outbound.dialerProxy}` : ''
                ].filter(Boolean),
                outcome:
                    outbound.protocol === 'blackhole'
                        ? ('blocked' as const)
                        : outbound.protocol === 'freedom'
                          ? ('direct' as const)
                          : ('forwarded' as const)
            }))
        ),
        ...clientTemplateFlows.flatMap((flow) =>
            flow.outbounds.map((outbound, index) => ({
                id: `client-template-result-${flow.uuid}-${index}`,
                kind: 'internet' as const,
                title:
                    outbound.protocol === 'blackhole'
                        ? uiText('blocked-18f2a09')
                        : outbound.protocol === 'freedom'
                          ? uiText('direct-002c7c6')
                          : uiText('forwarded-to-outbound-04ff29e'),
                detail:
                    outbound.protocol === 'blackhole'
                        ? uiText('connection-dropped-9049f3d')
                        : outbound.protocol === 'freedom'
                          ? uiText('exits-from-the-client-device-9073cc7')
                          : `${outbound.protocol}${outbound.destination ? ` → ${outbound.destination}` : ''}`,
                x: column.internet,
                y: flow.y + index * 102,
                uuid: `${flow.uuid}:${index}`,
                facts: [
                    `${uiText('client-template-outbound-2fca86a')}: ${outbound.tag}`,
                    outbound.protocol === 'freedom'
                        ? uiText('direct-is-handled-by-the-client-according-to-xray-json-011478f')
                        : outbound.protocol === 'blackhole'
                          ? uiText('traffic-is-dropped-c07151a')
                          : uiText('the-route-ends-at-this-client-outbound-dbdea2e')
                ],
                outcome:
                    outbound.protocol === 'blackhole'
                        ? ('blocked' as const)
                        : outbound.protocol === 'freedom'
                          ? ('direct' as const)
                          : ('forwarded' as const)
            }))
        )
    ]
    const itemById = new Map(items.map((item) => [item.id, item]))
    const links: Link[] = [
        ...Array.from(
            new Set(
                relatedHosts
                    .filter((host) =>
                        clientShortUuid
                            ? clientHostIds.has(host.uuid)
                            : !host.isDisabled && !host.isHidden
                    )
                    .map((host) => host.xrayJsonTemplateUuid ?? 'default')
            )
        ).map((templateUuid) => ({
            from: 'client',
            to: `template-${templateUuid}`,
            kind: 'clientProfile' as const
        })),
        ...clientTemplateFlows.flatMap((flow) => [
            ...flow.routes.map((_rule, index) => ({
                from: `template-${flow.uuid}`,
                to: `client-template-rule-${flow.uuid}-${index}`,
                kind: 'rule' as const
            })),
            ...flow.routes.flatMap((rule, ruleIndex) => [
                ...flow.outbounds.flatMap((outbound, outboundIndex) =>
                    outbound.tag === rule.outboundTag
                        ? [
                              {
                                  from: `client-template-rule-${flow.uuid}-${ruleIndex}`,
                                  to: `client-template-outbound-${flow.uuid}-${outboundIndex}`,
                                  kind: 'outbound' as const
                              }
                          ]
                        : []
                ),
                ...flow.balancers.flatMap((balancer, balancerIndex) =>
                    balancer.tag === rule.balancerTag
                        ? [
                              {
                                  from: `client-template-rule-${flow.uuid}-${ruleIndex}`,
                                  to: `client-template-balancer-${flow.uuid}-${balancerIndex}`,
                                  kind: 'balancer' as const
                              }
                          ]
                        : []
                )
            ]),
            ...flow.balancers.flatMap((balancer, balancerIndex) =>
                flow.outbounds.flatMap((outbound, outboundIndex) =>
                    balancer.selectors.some((selector) => outbound.tag.startsWith(selector)) ||
                    balancer.fallbackTag === outbound.tag
                        ? [
                              {
                                  from: `client-template-balancer-${flow.uuid}-${balancerIndex}`,
                                  to: `client-template-outbound-${flow.uuid}-${outboundIndex}`,
                                  kind: 'outbound' as const
                              }
                          ]
                        : []
                )
            ),
            ...flow.outbounds.map((_, index) => ({
                from: `client-template-outbound-${flow.uuid}-${index}`,
                to: `client-template-result-${flow.uuid}-${index}`,
                kind: 'internet' as const
            }))
        ]),
        ...relatedHosts
            .filter((host) => !clientShortUuid || clientHostIds.has(host.uuid))
            .map((host) => ({
                from: `template-${host.xrayJsonTemplateUuid ?? 'default'}`,
                to: `host-${host.uuid}`,
                kind: 'host' as const
            })),
        ...relatedHosts.flatMap((host) => {
            if (clientShortUuid && !clientHostIds.has(host.uuid)) return []
            return relatedSquads
                .filter((squad) => {
                    const allowedByHost =
                        host.internalSquads.mode === 'ALLOW_ONLY'
                            ? host.internalSquads.squads.includes(squad.uuid)
                            : !host.internalSquads.squads.includes(squad.uuid)
                    return (
                        allowedByHost &&
                        (!clientShortUuid || clientSquadIds.has(squad.uuid)) &&
                        squad.inbounds.some(
                            (inbound) => inbound.uuid === host.inbound.configProfileInboundUuid
                        )
                    )
                })
                .map((squad) => ({
                    from: `host-${host.uuid}`,
                    to: `squad-${squad.uuid}`,
                    kind: 'squad' as const
                }))
        }),
        ...relatedSquads
            .filter((squad) => !clientShortUuid || clientSquadIds.has(squad.uuid))
            .map((squad) => ({
                from: `squad-${squad.uuid}`,
                to: `profile-${profile.uuid}`,
                kind: 'profile' as const
            })),
        ...profile.inbounds.map((inbound) => ({
            from: `profile-${profile.uuid}`,
            to: `inbound-${inbound.uuid}`,
            kind: 'inbound' as const
        })),
        ...relatedNodes.flatMap((node) => {
            if (node.configProfile.activeConfigProfileUuid !== profile.uuid) return []
            const active = node.configProfile.activeInbounds.filter((inbound) =>
                inboundIds.has(inbound.uuid)
            )
            return active.map((inbound) => ({
                from: `inbound-${inbound.uuid}`,
                to: `node-${node.uuid}`,
                kind: 'node' as const
            }))
        }),
        ...routes.map((_, index) => ({
            from: `profile-${profile.uuid}`,
            to: `rule-${index}`,
            kind: 'rule' as const
        })),
        ...routes.flatMap((rule, index) =>
            outbounds.flatMap((outbound, outboundIndex) =>
                outbound.tag === rule.outboundTag
                    ? [
                          {
                              from: `rule-${index}`,
                              to: `outbound-${outboundIndex}`,
                              kind: 'outbound' as const
                          }
                      ]
                    : []
            )
        ),
        ...routes.flatMap((rule, index) =>
            rule.outboundTag
                ? []
                : balancers.flatMap((balancer, balancerIndex) =>
                      balancer.tag === rule.balancerTag
                          ? [
                                {
                                    from: `rule-${index}`,
                                    to: `balancer-${balancerIndex}`,
                                    kind: 'balancer' as const
                                }
                            ]
                          : []
                  )
        ),
        ...balancers.flatMap((balancer, balancerIndex) =>
            outbounds.flatMap((outbound, outboundIndex) =>
                balancer.selectors.some((selector) => outbound.tag.startsWith(selector)) ||
                balancer.fallbackTag === outbound.tag
                    ? [
                          {
                              from: `balancer-${balancerIndex}`,
                              to: `outbound-${outboundIndex}`,
                              kind: 'outbound' as const
                          }
                      ]
                    : []
            )
        ),
        ...outbounds.map((_, index) => ({
            from: `outbound-${index}`,
            to: `outcome-${index}`,
            kind: 'internet' as const
        }))
    ]
    const visibleItems = items.filter(
        (item) =>
            viewMode === 'all' ||
            item.kind === 'profile' ||
            (viewMode === 'access'
                ? ['client', 'clientProfile', 'host', 'squad', 'inbound', 'node'].includes(
                      item.kind
                  )
                : ['clientProfile', 'rule', 'balancer', 'outbound', 'internet'].includes(item.kind))
    )
    const layoutKey = JSON.stringify(visibleItems.map(({ id, x, y }) => ({ id, x, y })))
    const visibleIds = new Set(visibleItems.map((item) => item.id))
    const visibleLinks = links.filter(
        (link) => visibleIds.has(link.from) && visibleIds.has(link.to)
    )
    const connectionsKey = JSON.stringify(visibleLinks.map(({ from, to }) => ({ from, to })))
    const linkPaths = useCanvasPaths(layoutKey, connectionsKey)
    const selected = visibleIds.has(selectedId)
        ? itemById.get(selectedId)!
        : itemById.get(`profile-${profile.uuid}`)!
    const adjacentIds = new Set([
        selected.id,
        ...visibleLinks
            .filter((link) => link.from === selected.id || link.to === selected.id)
            .flatMap((link) => [link.from, link.to])
    ])
    const filtered = visibleItems.filter((item) =>
        `${item.title} ${item.detail}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())
    )
    const findings: { id: string; text: string }[] = [
        ...unresolvedSnippets.map((name) => ({
            id: `profile-${profile.uuid}`,
            text: `${uiText('snippet-unresolved-6616234')}: ${name}`
        })),
        ...relatedHosts.flatMap((host) => {
            const inboundUuid = host.inbound.configProfileInboundUuid
            const allowed = relatedSquads.some(
                (squad) =>
                    squad.inbounds.some((inbound) => inbound.uuid === inboundUuid) &&
                    (host.internalSquads.mode === 'ALLOW_ONLY'
                        ? host.internalSquads.squads.includes(squad.uuid)
                        : !host.internalSquads.squads.includes(squad.uuid))
            )
            return [
                ...(host.isDisabled
                    ? [
                          {
                              id: `host-${host.uuid}`,
                              text: `${host.remark}: ${uiText('host-disabled-5a8b830')}`
                          }
                      ]
                    : []),
                ...(!allowed
                    ? [
                          {
                              id: `host-${host.uuid}`,
                              text: `${host.remark}: ${uiText('no-allowed-squad-for-its-inbound-a3b1eef')}`
                          }
                      ]
                    : [])
            ]
        }),
        ...profile.inbounds.flatMap((inbound) =>
            relatedNodes.length === 0 ||
            relatedNodes.some((node) =>
                node.configProfile.activeInbounds.some((active) => active.uuid === inbound.uuid)
            )
                ? []
                : [
                      {
                          id: `inbound-${inbound.uuid}`,
                          text: `${inbound.tag}: ${uiText('not-active-on-any-node-4298c77')}`
                      }
                  ]
        ),
        ...relatedNodes.flatMap((node) =>
            node.isDisabled
                ? [
                      {
                          id: `node-${node.uuid}`,
                          text: `${node.name}: ${uiText('node-disabled-9ed5252')}`
                      }
                  ]
                : []
        ),
        ...balancers.flatMap((balancer, index) =>
            outbounds.some(
                (outbound) =>
                    balancer.selectors.some((selector) => outbound.tag.startsWith(selector)) ||
                    balancer.fallbackTag === outbound.tag
            )
                ? []
                : [
                      {
                          id: `balancer-${index}`,
                          text: `${balancer.tag}: ${uiText('no-matching-outbounds-ccb79ca')}`
                      }
                  ]
        ),
        ...rules.flatMap((rule, index) =>
            rule.outboundTag && !outbounds.some((outbound) => outbound.tag === rule.outboundTag)
                ? [
                      {
                          id: `rule-${index}`,
                          text: `${ruleLabel(rule)}: ${uiText('outbound-not-found-6eb20b6')} (${rule.outboundTag})`
                      }
                  ]
                : rule.balancerTag &&
                    !rule.outboundTag &&
                    !balancers.some((balancer) => balancer.tag === rule.balancerTag)
                  ? [
                        {
                            id: `rule-${index}`,
                            text: `${ruleLabel(rule)}: ${uiText('balancer-not-found-b2655a5')} (${rule.balancerTag})`
                        }
                    ]
                  : []
        )
    ]
    const loading = nodesLoading || hostsLoading || squadsLoading
    const failed = nodesError || hostsError || squadsError
    const labels: Record<Kind, string> = {
        client: uiText('client-0c77fe0'),
        clientProfile: uiText('client-profile-e233471'),
        host: uiText('subscription-host-5f3e4ca'),
        squad: uiText('squad-df6163f'),
        profile: uiText('profile-d696a35'),
        inbound: uiText('inbound-d17a5bd'),
        node: uiText('node-e933725'),
        rule: uiText('profile-rules-in-order-800f3bb'),
        balancer: uiText('balancer-616a69d'),
        outbound: uiText('xray-outbound-9100f3c'),
        internet: uiText('outcome-4e80abb')
    }

    const openSelected = () => {
        if (selected.kind === 'profile' || selected.kind === 'inbound') onOpenEditor?.()
        if (selected.kind === 'node') showModal('nodes_editNodeModal', { nodeUuid: selected.uuid })
        if (selected.kind === 'host') showModal('hosts_editHostDrawer', { hostUuid: selected.uuid })
        if (selected.kind === 'squad')
            showModal('internalSquads_internalSquadsInboundsDrawer', { squadUuid: selected.uuid })
    }

    const focusItem = (id: string) => {
        const item = itemById.get(id)
        const frame = canvasRef.current
        if (!item || !frame) return
        const scale = Math.max(transformState.current.scale, 0.85)
        transformSetter.current?.(
            frame.clientWidth / 2 - (item.x + cardWidth / 2) * scale,
            frame.clientHeight / 2 - (item.y + cardHeight / 2) * scale,
            scale,
            250
        )
    }

    const graphHeight = height + 900
    const minCanvasScale = () => {
        if (!canvasViewport.width || !canvasViewport.height) return 0.2
        return Math.min(
            1,
            Math.max(canvasViewport.width / graphWidth, canvasViewport.height / graphHeight)
        )
    }

    useEffect(() => {
        const frame = canvasRef.current
        if (!frame) return
        const observer = new ResizeObserver(() => {
            setCanvasViewport({ width: frame.clientWidth, height: frame.clientHeight })
        })
        observer.observe(frame)
        return () => observer.disconnect()
    }, [loading, failed])

    const fit = (setTransform: (x: number, y: number, scale: number) => void, mode = viewMode) => {
        const frame = canvasRef.current
        if (!frame) return
        const shown = items.filter(
            (item) =>
                mode === 'all' ||
                item.kind === 'profile' ||
                (mode === 'access'
                    ? ['client', 'clientProfile', 'host', 'squad', 'inbound', 'node'].includes(
                          item.kind
                      )
                    : ['rule', 'balancer', 'outbound', 'internet'].includes(item.kind))
        )
        const minX = Math.min(...shown.map((item) => item.x), 940)
        const maxX = Math.max(...shown.map((item) => item.x + cardWidth), 1172)
        const maxY = Math.max(...shown.map((item) => item.y + cardHeight), 140) + 40
        const nextScale = Math.max(
            minCanvasScale(),
            Math.min(
                1,
                (frame.clientWidth - 32) / (maxX - minX + 40),
                (frame.clientHeight - 32) / maxY
            )
        )
        setTransform(
            (frame.clientWidth - (maxX - minX) * nextScale) / 2 - minX * nextScale,
            Math.max(16, (frame.clientHeight - maxY * nextScale) / 2),
            nextScale
        )
    }

    useEffect(() => {
        const frame = canvasRef.current
        if (!frame) return
        const onWheel = (event: WheelEvent) => {
            const setTransform = transformSetter.current
            if (!setTransform) return
            event.preventDefault()
            event.stopPropagation()
            const unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? frame.clientHeight : 1
            const deltaX = Math.max(-240, Math.min(240, event.deltaX * unit))
            const deltaY = Math.max(-240, Math.min(240, event.deltaY * unit))
            const { scale, x, y } = transformState.current
            if (Math.abs(deltaX) > Math.abs(deltaY) && !event.ctrlKey) {
                setTransform(x - deltaX, y - deltaY, scale, 0)
                return
            }
            if (deltaY === 0) return
            const nextScale = Math.max(
                minCanvasScale(),
                Math.min(2, scale * Math.exp(-deltaY * (event.ctrlKey ? 0.008 : 0.0014)))
            )
            if (nextScale === scale) return
            const rect = frame.getBoundingClientRect()
            const pointerX = event.clientX - rect.left
            const pointerY = event.clientY - rect.top
            const ratio = nextScale / scale
            setTransform(
                pointerX - (pointerX - x) * ratio,
                pointerY - (pointerY - y) * ratio,
                nextScale,
                0
            )
        }
        frame.addEventListener('wheel', onWheel, { passive: false, capture: true })
        return () => frame.removeEventListener('wheel', onWheel, true)
    }, [failed, loading])

    return (
        <section
            aria-label={uiText('profile-canvas-d14ca6b')}
            className={`${classes.shell} ${fullscreen ? classes.fullscreen : ''}`}
        >
            <div className={classes.topbar}>
                <div>
                    <Text fw={700} size="lg">
                        {uiText('profile-map-1112855')}
                    </Text>
                    <Text c="dimmed" size="xs">
                        {uiText('drag-the-empty-canvas-to-pan-use-the-wheel-to-zoom-4a49b93')}
                    </Text>
                </div>
                <Group gap="xs" wrap="nowrap">
                    <Badge color="gray" variant="light">
                        {visibleItems.length} {uiText('items-5f3c4f8')}
                    </Badge>
                    <Tooltip
                        label={
                            fullscreen
                                ? uiText('exit-fullscreen-37fd4e3')
                                : uiText('fullscreen-c461dbb')
                        }
                    >
                        <ActionIcon
                            aria-label={
                                fullscreen
                                    ? uiText('exit-fullscreen-37fd4e3')
                                    : uiText('fullscreen-c461dbb')
                            }
                            onClick={() => setFullscreen(!fullscreen)}
                            variant="default"
                        >
                            {fullscreen ? (
                                <TbArrowsMinimize size={18} />
                            ) : (
                                <TbArrowsMaximize size={18} />
                            )}
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </div>
            <div className={classes.studyBar}>
                <SegmentedControl
                    aria-label={uiText('canvas-layer-391f9d9')}
                    data={[
                        { label: uiText('all-a52ace4'), value: 'all' },
                        { label: uiText('access-ec5ba0a'), value: 'access' },
                        { label: uiText('routing-bcba696'), value: 'routing' }
                    ]}
                    onChange={(value) => {
                        const nextMode = value as typeof viewMode
                        setViewMode(nextMode)
                        setSelectedId(`profile-${profile.uuid}`)
                        requestAnimationFrame(() => {
                            if (transformSetter.current) fit(transformSetter.current, nextMode)
                        })
                    }}
                    size="xs"
                    value={viewMode}
                />
                <Text c="dimmed" size="xs">
                    {uiText('select-a-block-to-inspect-its-properties-and-connections-2347bec')}
                </Text>
            </div>
            <div className={classes.clientStudy}>
                <form
                    onSubmit={(event) => {
                        event.preventDefault()
                        setClientShortUuid(clientInput.trim())
                    }}
                >
                    <TextInput
                        aria-label={uiText('client-short-id-62efa46')}
                        onChange={(event) => setClientInput(event.currentTarget.value)}
                        placeholder={uiText('client-short-id-62efa46')}
                        size="xs"
                        maxLength={128}
                        value={clientInput}
                    />
                    <Button disabled={!clientInput.trim()} size="xs" type="submit" variant="light">
                        {uiText('check-access-abb9a17')}
                    </Button>
                    {clientShortUuid && (
                        <Button
                            onClick={() => {
                                setClientShortUuid('')
                                setClientInput('')
                            }}
                            size="xs"
                            variant="subtle"
                        >
                            {uiText('clear-83b12c2')}
                        </Button>
                    )}
                </form>
                {clientPathsLoading && (
                    <Text c="dimmed" role="status" size="xs">
                        {uiText('checking-client-access-a3880a4')}
                    </Text>
                )}
                {clientPathsError && (
                    <Text c="red" role="alert" size="xs">
                        {uiText(
                            'could-not-load-the-client-path-check-the-id-and-traffic-paths--fb70989'
                        )}
                    </Text>
                )}
                {verifiedClientPaths?.user && (
                    <div className={classes.clientResults}>
                        <Text size="xs">
                            <strong>{verifiedClientPaths.user.username}</strong> ·{' '}
                            {verifiedClientPaths.user.status} ·{' '}
                            {uiText('accessible-profile-hosts-72b0b17')}: {clientHosts.length}
                        </Text>
                        {clientHosts.map((host) => (
                            <button
                                key={host.uuid}
                                onClick={() => {
                                    setViewMode('all')
                                    setSelectedId(`host-${host.uuid}`)
                                    focusItem(`host-${host.uuid}`)
                                }}
                                type="button"
                            >
                                {host.remark} · {host.address}:{host.port} ·{' '}
                                {host.nodes.join(', ') || '—'}
                            </button>
                        ))}
                        {!clientHosts.length && (
                            <Text c="dimmed" size="xs">
                                {uiText(
                                    'this-client-has-no-accessible-hosts-in-this-profile-12cda92'
                                )}
                            </Text>
                        )}
                    </div>
                )}
            </div>
            {!loading && !failed && findings.length > 0 && (
                <div className={classes.findings}>
                    <strong>
                        {uiText('check-connections-5a8dc11')} · {findings.length}
                    </strong>
                    <div>
                        {findings.slice(0, 12).map((finding, index) => (
                            <button
                                key={`${finding.id}-${index}`}
                                onClick={() => {
                                    setViewMode('all')
                                    setSelectedId(finding.id)
                                    focusItem(finding.id)
                                }}
                                type="button"
                            >
                                {finding.text}
                            </button>
                        ))}
                    </div>
                    {findings.length > 12 && (
                        <small>
                            {uiText('value-more-findings-39ca181', {
                                value1: findings.length - 12
                            })}
                        </small>
                    )}
                </div>
            )}
            {loading ? (
                <div className={classes.message}>
                    <Loader size="sm" />
                    <Text size="sm">{uiText('loading-relations-5a4c580')}</Text>
                </div>
            ) : failed ? (
                <div className={classes.message}>
                    <Text c="red" size="sm">
                        {uiText('unable-to-load-relations-b37edfe')}
                    </Text>
                    <Button
                        onClick={() => {
                            void refetchNodes()
                            void refetchHosts()
                            void refetchSquads()
                        }}
                        size="xs"
                        variant="light"
                    >
                        {uiText('retry-942087c')}
                    </Button>
                </div>
            ) : (
                <TransformWrapper
                    centerOnInit={false}
                    doubleClick={{ disabled: true }}
                    initialScale={1}
                    limitToBounds
                    maxScale={2}
                    minScale={minCanvasScale()}
                    onInit={({ setTransform }) => {
                        transformSetter.current = setTransform
                        requestAnimationFrame(() => fit(setTransform))
                    }}
                    onTransform={(_, state) => {
                        transformState.current = {
                            scale: state.scale,
                            x: state.positionX,
                            y: state.positionY
                        }
                        if (zoomLabelRef.current)
                            zoomLabelRef.current.textContent = `${Math.round(state.scale * 100)}%`
                        const frame = canvasRef.current
                        const viewport = miniViewportRef.current
                        if (frame && viewport) {
                            viewport.setAttribute('x', String(-state.positionX / state.scale))
                            viewport.setAttribute('y', String(-state.positionY / state.scale))
                            viewport.setAttribute('width', String(frame.clientWidth / state.scale))
                            viewport.setAttribute(
                                'height',
                                String(frame.clientHeight / state.scale)
                            )
                        }
                    }}
                    panning={{ excluded: [classes.graphNode] }}
                    wheel={{ disabled: true }}
                >
                    {({ zoomIn, zoomOut, setTransform, zoomToElement }) => (
                        <div className={classes.workspace}>
                            <aside
                                aria-label={uiText('canvas-navigation-579dfc8')}
                                className={classes.navigator}
                            >
                                <TextInput
                                    aria-label={uiText('find-item-15cb4f1')}
                                    leftSection={<TbSearch size={15} />}
                                    onChange={(event) => setSearch(event.currentTarget.value)}
                                    placeholder={uiText('find-an-item-4871b5f')}
                                    size="sm"
                                    value={search}
                                />
                                <div className={classes.navigatorList}>
                                    {filtered.map((item) => (
                                        <button
                                            aria-current={
                                                selected.id === item.id ? 'true' : undefined
                                            }
                                            className={classes.navigatorItem}
                                            data-kind={item.kind}
                                            data-outcome={item.outcome}
                                            key={item.id}
                                            onClick={() => {
                                                setSelectedId(item.id)
                                                zoomToElement(`canvas-${item.id}`, 1.05)
                                            }}
                                            type="button"
                                        >
                                            <span className={classes.navigatorDot} />
                                            <span>
                                                <strong>{item.title}</strong>
                                                <small>{labels[item.kind]}</small>
                                            </span>
                                        </button>
                                    ))}
                                    {filtered.length === 0 && (
                                        <Text c="dimmed" p="sm" size="xs">
                                            {uiText('no-matching-items-4d1d151')}
                                        </Text>
                                    )}
                                </div>
                            </aside>
                            <div className={classes.canvasFrame} ref={canvasRef}>
                                <div className={classes.controls}>
                                    <Tooltip label={uiText('zoom-in-0e47f09')}>
                                        <ActionIcon
                                            aria-label={uiText('zoom-in-0e47f09')}
                                            onClick={() => zoomIn(0.2)}
                                            variant="default"
                                        >
                                            <TbPlus size={17} />
                                        </ActionIcon>
                                    </Tooltip>
                                    <Tooltip label={uiText('zoom-out-bc7b631')}>
                                        <ActionIcon
                                            aria-label={uiText('zoom-out-bc7b631')}
                                            onClick={() => zoomOut(0.2)}
                                            variant="default"
                                        >
                                            <TbMinus size={17} />
                                        </ActionIcon>
                                    </Tooltip>
                                    <Tooltip label={uiText('fit-map-7d3b421')}>
                                        <ActionIcon
                                            aria-label={uiText('fit-map-7d3b421')}
                                            onClick={() => fit(setTransform)}
                                            variant="default"
                                        >
                                            <TbFocusCentered size={17} />
                                        </ActionIcon>
                                    </Tooltip>
                                    <span className={classes.zoomLabel} ref={zoomLabelRef}>
                                        100%
                                    </span>
                                </div>
                                <TransformComponent
                                    contentClass={classes.transformContent}
                                    wrapperClass={classes.transformWrapper}
                                >
                                    <div
                                        className={classes.graph}
                                        onPointerLeave={(event) => {
                                            event.currentTarget.style.setProperty(
                                                '--cursor-dots-opacity',
                                                '0'
                                            )
                                        }}
                                        onPointerMove={(event) => {
                                            const rect = event.currentTarget.getBoundingClientRect()
                                            event.currentTarget.style.setProperty(
                                                '--cursor-dot-x',
                                                `${(event.clientX - rect.left) / transformState.current.scale}px`
                                            )
                                            event.currentTarget.style.setProperty(
                                                '--cursor-dot-y',
                                                `${(event.clientY - rect.top) / transformState.current.scale}px`
                                            )
                                            event.currentTarget.style.setProperty(
                                                '--cursor-dots-opacity',
                                                '1'
                                            )
                                        }}
                                        style={{ height: graphHeight, width: graphWidth }}
                                    >
                                        {Object.entries(column)
                                            .filter(
                                                ([kind]) =>
                                                    viewMode === 'all' ||
                                                    kind === 'profile' ||
                                                    (viewMode === 'access'
                                                        ? [
                                                              'client',
                                                              'clientProfile',
                                                              'host',
                                                              'squad',
                                                              'inbound',
                                                              'node'
                                                          ].includes(kind)
                                                        : [
                                                              'rule',
                                                              'balancer',
                                                              'outbound',
                                                              'internet'
                                                          ].includes(kind))
                                            )
                                            .map(([kind, x]) => (
                                                <span
                                                    className={classes.columnHeading}
                                                    key={kind}
                                                    style={{
                                                        left: x,
                                                        top: [
                                                            'rule',
                                                            'balancer',
                                                            'outbound',
                                                            'internet'
                                                        ].includes(kind)
                                                            ? policyTop - 32
                                                            : 20
                                                    }}
                                                >
                                                    {labels[kind as Kind]}
                                                </span>
                                            ))}
                                        <svg
                                            aria-hidden="true"
                                            className={classes.edges}
                                            height={graphHeight}
                                            width={graphWidth}
                                        >
                                            <defs>
                                                <marker
                                                    id="profile-flow-arrow"
                                                    markerHeight="7"
                                                    markerWidth="7"
                                                    orient="auto"
                                                    refX="6"
                                                    refY="3.5"
                                                >
                                                    <path d="M 0 0 L 7 3.5 L 0 7 Z" />
                                                </marker>
                                            </defs>
                                            {visibleLinks.map((link, index) => {
                                                const from = itemById.get(link.from)
                                                const to = itemById.get(link.to)
                                                return from && to ? (
                                                    <path
                                                        pathLength={1}
                                                        className={
                                                            adjacentIds.has(link.from) &&
                                                            adjacentIds.has(link.to)
                                                                ? classes.edgeActive
                                                                : undefined
                                                        }
                                                        d={
                                                            linkPaths[
                                                                JSON.stringify([from.id, to.id])
                                                            ]
                                                        }
                                                        data-kind={link.kind}
                                                        data-outcome={to.outcome}
                                                        key={`${link.from}-${link.to}-${index}`}
                                                        style={{
                                                            animationDelay: `${Math.min(index, 24) * 35}ms`
                                                        }}
                                                        markerEnd="url(#profile-flow-arrow)"
                                                    />
                                                ) : null
                                            })}
                                        </svg>
                                        {visibleItems.map((item) => (
                                            <button
                                                aria-pressed={selected.id === item.id}
                                                className={classes.graphNode}
                                                data-related={adjacentIds.has(item.id)}
                                                data-kind={item.kind}
                                                data-outcome={item.outcome}
                                                id={`canvas-${item.id}`}
                                                key={item.id}
                                                onClick={() => setSelectedId(item.id)}
                                                onDoubleClick={() =>
                                                    zoomToElement(`canvas-${item.id}`, 1.05)
                                                }
                                                style={{ left: item.x, top: item.y }}
                                                type="button"
                                            >
                                                <span className={classes.nodeIcon}>
                                                    {item.kind === 'profile' ? (
                                                        <TbSitemap />
                                                    ) : item.kind === 'node' ? (
                                                        <TbServer />
                                                    ) : item.kind === 'clientProfile' ||
                                                      item.kind === 'internet' ? (
                                                        <TbWorld />
                                                    ) : item.kind === 'squad' ? (
                                                        <TbUsers />
                                                    ) : (
                                                        <TbPlugConnected />
                                                    )}
                                                </span>
                                                <span className={classes.nodeText}>
                                                    <strong title={item.title}>{item.title}</strong>
                                                    <small>{item.detail}</small>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </TransformComponent>
                                <button
                                    aria-label={uiText('navigate-using-minimap-44dd66c')}
                                    className={classes.minimap}
                                    onClick={(event) => {
                                        if (event.detail === 0) {
                                            zoomToElement(`canvas-${selected.id}`, 1.05)
                                            return
                                        }
                                        const frame = canvasRef.current
                                        if (!frame) return
                                        const rect = event.currentTarget
                                            .querySelector('svg')
                                            ?.getBoundingClientRect()
                                        if (!rect) return
                                        const x =
                                            ((event.clientX - rect.left) / rect.width) * graphWidth
                                        const y =
                                            ((event.clientY - rect.top) / rect.height) * height
                                        const currentScale = transformState.current.scale
                                        setTransform(
                                            frame.clientWidth / 2 - x * currentScale,
                                            frame.clientHeight / 2 - y * currentScale,
                                            currentScale
                                        )
                                    }}
                                    type="button"
                                >
                                    <svg
                                        aria-hidden="true"
                                        preserveAspectRatio="none"
                                        viewBox={`0 0 ${graphWidth} ${graphHeight}`}
                                    >
                                        {visibleItems.map((item) => (
                                            <rect
                                                className={classes.miniNode}
                                                data-kind={item.kind}
                                                data-outcome={item.outcome}
                                                height={cardHeight}
                                                key={item.id}
                                                rx="12"
                                                width={cardWidth}
                                                x={item.x}
                                                y={item.y}
                                            />
                                        ))}
                                        <rect
                                            className={classes.miniViewport}
                                            height="0"
                                            ref={miniViewportRef}
                                            width="0"
                                            x="0"
                                            y="0"
                                        />
                                    </svg>
                                </button>
                                <Button
                                    className={classes.locate}
                                    onClick={() => zoomToElement(`canvas-${selected.id}`, 1.05)}
                                    size="xs"
                                    variant="default"
                                >
                                    {uiText('go-to-selected-b5b8d43')}
                                </Button>
                            </div>
                        </div>
                    )}
                </TransformWrapper>
            )}
            {!loading && !failed && (
                <details className={classes.detailsPanel}>
                    <summary>
                        {labels[selected.kind]} · {selected.title}
                    </summary>
                    <Text c="dimmed" size="xs">
                        {selected.detail}
                    </Text>
                    <div className={classes.facts}>
                        {selected.facts?.map((fact, index) => (
                            <Text key={`${fact}-${index}`} size="xs">
                                {fact}
                            </Text>
                        ))}
                    </div>
                    {['profile', 'inbound', 'node', 'host', 'squad'].includes(selected.kind) && (
                        <Button mt="sm" onClick={openSelected} size="xs" variant="light">
                            {uiText('open-settings-ca381c1')}
                        </Button>
                    )}
                </details>
            )}
        </section>
    )
}

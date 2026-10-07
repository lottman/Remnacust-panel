import { GetApiTokenScopesCommand } from '@remnawave/backend-contract'
import { createElement, ReactNode } from 'react'
import { HiServer } from 'react-icons/hi'
import { PiArrowsInCardinalFill, PiListChecks, PiUsers } from 'react-icons/pi'
import {
    TbApi,
    TbChartArcs,
    TbCirclesRelation,
    TbCode,
    TbCpu,
    TbCreditCard,
    TbDeviceAnalytics,
    TbFolder,
    TbHexagon,
    TbKey,
    TbPackage,
    TbRadar2,
    TbReportAnalytics,
    TbTags,
    TbWebhook
} from 'react-icons/tb'

import { XrayLogo } from '@shared/ui/logos'

export type ScopeResource = GetApiTokenScopesCommand.Response['response']['resources'][number]
export type ScopeEndpoint = ScopeResource['endpoints'][number]
export type KindState = 'none' | 'off' | 'on' | 'partial'

const RESOURCE_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
    'bandwidth-stats': TbChartArcs,
    'config-profiles': XrayLogo,
    'external-squads': TbWebhook,
    hosts: PiListChecks,
    'hosts-bulk-actions': PiListChecks,
    'hwid-user-devices': TbDeviceAnalytics,
    'infra-billing': TbCreditCard,
    'internal-squads': TbCirclesRelation,
    connections: TbRadar2,
    keygen: TbKey,
    metadata: TbTags,
    'node-plugins': TbPackage,
    nodes: HiServer,
    'subscription-page-configs': PiArrowsInCardinalFill,
    'subscription-request-history': TbReportAnalytics,
    'subscription-settings': TbHexagon,
    'subscription-template': TbFolder,
    subscriptions: TbHexagon,
    system: TbCpu,
    users: PiUsers,
    snippets: TbCode
}

export const renderResourceIcon = (resource: string, size = 18): ReactNode =>
    createElement(RESOURCE_ICONS[resource] ?? TbApi, { size })

export const humanizeResource = (resource: string): string =>
    resource
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')

export const getMethodColor = (method: string): string => {
    switch (method.toUpperCase()) {
        case 'DELETE':
            return 'red'
        case 'GET':
            return 'blue'
        case 'PATCH':
            return 'yellow'
        case 'POST':
            return 'teal'
        case 'PUT':
            return 'grape'
        default:
            return 'gray'
    }
}

export const getReadKeys = (resource: ScopeResource): string[] =>
    resource.endpoints
        .filter((endpoint) => endpoint.kind === 'read')
        .map((endpoint) => endpoint.key)

export const getWriteKeys = (resource: ScopeResource): string[] =>
    resource.endpoints
        .filter((endpoint) => endpoint.kind === 'write')
        .map((endpoint) => endpoint.key)

export const getAllKeys = (resource: ScopeResource): string[] =>
    resource.endpoints.map((endpoint) => endpoint.key)

export const expandScopesToKeys = (resources: ScopeResource[], scopes: string[]): string[] => {
    const byName = new Map(resources.map((resource) => [resource.resource, resource]))
    const keys = new Set<string>()

    for (const scope of scopes) {
        if (scope === '*') {
            resources.forEach((resource) =>
                resource.endpoints.forEach((endpoint) => keys.add(endpoint.key))
            )
        } else {
            const separator = scope.indexOf(':')
            const resourceName = separator === -1 ? scope : scope.slice(0, separator)
            const rest = separator === -1 ? '' : scope.slice(separator + 1)
            const resource = byName.get(resourceName)

            if (resource) {
                if (rest === '*') getAllKeys(resource).forEach((key) => keys.add(key))
                else if (rest === 'read') getReadKeys(resource).forEach((key) => keys.add(key))
                else if (rest === 'write') getWriteKeys(resource).forEach((key) => keys.add(key))
                else if (resource.endpoints.some((endpoint) => endpoint.key === scope))
                    keys.add(scope)
            }
        }
    }

    return Array.from(keys)
}

export const getKindState = (keys: string[], selectedEndpoints: Set<string>): KindState => {
    if (keys.length === 0) return 'none'
    const selected = keys.filter((key) => selectedEndpoints.has(key)).length
    if (selected === 0) return 'off'
    if (selected === keys.length) return 'on'
    return 'partial'
}

export const countSelected = (endpoints: ScopeEndpoint[], selectedEndpoints: Set<string>): number =>
    endpoints.reduce((acc, endpoint) => acc + (selectedEndpoints.has(endpoint.key) ? 1 : 0), 0)

export const buildScopes = (
    resources: ScopeResource[],
    selectedEndpoints: Set<string>
): string[] => {
    // Only the explicit full-access switch grants '*'. Selecting every current
    // endpoint must never grant future endpoints or hidden administrative routes.
    return resources.flatMap(resource => resource.endpoints
        .filter(endpoint => selectedEndpoints.has(endpoint.key))
        .map(endpoint => endpoint.key))
}

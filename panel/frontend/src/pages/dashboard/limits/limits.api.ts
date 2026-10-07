import { TUsersStatus } from '@remnawave/backend-contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { instance } from '@shared/api/axios'

export type Scope = {
    kind: 'HOST' | 'TAG'
    key: string
    name: string
    limitBytes: string
    usedBytes?: string
    viewPosition?: number
    speedLimitMbps: number | null
    totalSpeedLimitMbps: number | null
    trafficMultiplier: number | null
    hostCount: number
    paused: boolean
}
export type Selection =
    | { type: 'ALL' }
    | { type: 'SELECTED'; userIds: string[] }
    | { type: 'SQUAD'; squadType: 'INTERNAL' | 'EXTERNAL'; squadUuid: string }
export type Action = {
    kind: Scope['kind']
    key: string
    action: 'ADD' | 'RESET' | 'PAUSE' | 'RESUME' | 'UNLIMITED' | 'LIMITED'
    amountBytes: number
    requestId: string
    selection: Selection
}
export type UserFilters = {
    pageSize: number
    status: string
    state: string
    sort: string
    direction: string
}
export type LimitUser = {
    shortUuid: string
    email: string | null
    telegramId: string | null
    id: string
    username: string
    status: TUsersStatus
    onlineAt: string | null
    expireAt: string
    tag: string | null
    lastConnectedNode: { name: string; countryCode: string } | null
    usedBytes: string
    baseLimitBytes: string
    bonusBytes: string
    limitBytes: string
    paused: boolean
    accessNow: boolean
    unlimited: boolean
}
export type UsersResponse = {
    scope: Scope
    users: LimitUser[]
    total: number
    allUsers: number
    page: number
    pageSize: number
    summary: { usedBytes: string; pausedUsers: number; exhaustedUsers: number }
}
export type SelectionState = {
    total: number
    pausedUsers: number
    unlimitedUsers: number
    scopePaused: boolean
}
const key = ['limit-management']
export function useLimitSelectionState(scope: Scope, selection: Selection, enabled: boolean) {
    return useQuery({
        queryKey: [...key, 'selection-state', scope.kind, scope.key, selection],
        enabled: enabled && (selection.type !== 'SELECTED' || selection.userIds.length > 0),
        staleTime: 0,
        refetchInterval: 15000,
        refetchOnWindowFocus: true,
        queryFn: async ({ signal }) =>
            (
                await instance.post<{ response: SelectionState }>(
                    '/api/limits/selection-state',
                    { kind: scope.kind, key: scope.key, selection },
                    { signal }
                )
            ).data.response
    })
}
const get = async <T>(url: string, params?: Record<string, unknown>, signal?: AbortSignal) =>
    (await instance.get<{ response: T }>(`/api/limits${url}`, { params, signal })).data.response
export const useLimitScopes = () =>
    useQuery({
        queryKey: [...key, 'scopes'],
        queryFn: ({ signal }) => get<Scope[]>('', undefined, signal),
        staleTime: 0,
        refetchOnWindowFocus: true
    })
export const useLimitTargets = () =>
    useQuery({
        queryKey: [...key, 'targets'],
        queryFn: ({ signal }) =>
            get<{ type: 'INTERNAL' | 'EXTERNAL'; uuid: string; name: string }[]>(
                '/targets',
                undefined,
                signal
            ),
        staleTime: 0,
        refetchOnWindowFocus: true
    })
export const useLimitUsers = (
    scope: Scope,
    page: number,
    search: string,
    squad: Selection,
    enabled = true,
    filters?: UserFilters
) =>
    useQuery({
        queryKey: [...key, scope.kind, scope.key, page, search, squad, filters],
        enabled,
        refetchInterval: 15000,
        staleTime: 0,
        refetchOnWindowFocus: true,
        queryFn: ({ signal }) =>
            get<UsersResponse>(
                '/users',
                {
                    kind: scope.kind,
                    key: scope.key,
                    page,
                    search,
                    ...filters,
                    ...(squad.type === 'SQUAD'
                        ? { squadType: squad.squadType, squadUuid: squad.squadUuid }
                        : {})
                },
                signal
            )
    })
export function useLimitAction() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (action: Action) =>
            (
                await instance.post<{
                    response: {
                        affectedUsers: number
                        replayed: boolean
                        saved: boolean
                        enforcement: string
                    }
                }>(
                    action.action === 'UNLIMITED' || action.action === 'LIMITED'
                        ? '/api/limits/unlimited'
                        : '/api/limits/actions',
                    action.action === 'UNLIMITED' || action.action === 'LIMITED'
                        ? {
                              kind: action.kind,
                              key: action.key,
                              selection: action.selection,
                              requestId: action.requestId,
                              enabled: action.action === 'UNLIMITED'
                          }
                        : action
                )
            ).data.response,
        onSuccess: () => client.invalidateQueries({ queryKey: key })
    })
}

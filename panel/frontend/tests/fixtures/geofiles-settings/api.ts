import type { Geofile } from '../../../src/widgets/dashboard/templates/subscription-template-editor/geofile-types'
import type { UseQueryOptions } from '@tanstack/react-query'

import { createQueryKeys } from '@lukemorales/query-key-factory'
import { GEOFILE_INLINE_RULE_LIMIT } from '@remnawave/backend-contract'
import { useMutation, useQuery, type QueryClient } from '@tanstack/react-query'

import { queryClient } from '../../../src/shared/api/query-client'
import { geofilePresets } from '../../../src/widgets/dashboard/templates/subscription-template-editor/geofile-presets'

export { queryClient }
export { useUpdateSubscriptionSettings } from '../../../src/shared/api/hooks/subscription-settings/subscription-settings.mutation.hooks'

export interface Settings {
    uuid: string
    geofilesSystemEnabled: boolean
    geofilesEnabled: boolean
    serveJsonAtBaseSubscription: boolean
    geofilesInlineRuleLimit: number
    randomizeHosts: boolean
    isShowCustomRemarks: boolean
}

type Operation = 'settingsGET' | 'settingsMutation' | 'filesGET' | 'fileMutation'
type Request = {
    id: number
    operation: Operation
    method: string
    url: string
    body?: unknown
    status: 'pending' | 'success' | 'error' | 'aborted'
    startedAt: number
    finishedAt?: number
}
type Pending = {
    request: Request
    resolve: (response?: unknown) => void
    reject: (message?: string) => void
}
const clone = <T>(value: T): T => structuredClone(value)
export const initialSettings: Settings = {
    uuid: '11111111-1111-4111-8111-111111111111',
    geofilesSystemEnabled: true,
    geofilesEnabled: false,
    serveJsonAtBaseSubscription: true,
    geofilesInlineRuleLimit: GEOFILE_INLINE_RULE_LIMIT,
    randomizeHosts: false,
    isShowCustomRemarks: false
}
export const subscriptionSettingsQueryKeys = createQueryKeys('subscriptionSettings', {
    getSubscriptionSettings: { queryKey: null }
})
export const QueryKeys = { subscriptionSettings: subscriptionSettingsQueryKeys }
export const settingsKey = subscriptionSettingsQueryKeys.getSubscriptionSettings.queryKey
export const defaultSources = geofilePresets.filter((source) => source.provider === 'Loyalsoldier')
export function defaultFiles(): Geofile[] {
    return defaultSources.map((source) => ({
        id: source.id,
        name: source.name,
        kind: source.kind,
        size: 1024,
        sha256: '0'.repeat(64),
        filename: source.kind + '.dat',
        url: '/api/geofiles/' + source.id + '/download',
        categories: source.kind === 'geoip' ? ['ru'] : ['category-ru'],
        origin: 'preset',
        editPolicy: 'copy',
        refresh: {
            sourceUrl: source.url,
            enabled: true,
            intervalSeconds: 86400,
            lastSuccessAt: '2026-11-14T12:00:00.000Z'
        }
    }))
}

let settings = clone(initialSettings)
let files = defaultFiles()
let nextId = 0
const calls: Request[] = []
const pending = new Map<number, Pending>()
const held = new Set<Operation>()
const delays = new Map<Operation, number>()
const failures = new Map<Operation, string>()

async function request<T>(
    operation: Operation,
    method: string,
    url: string,
    body: unknown,
    execute: () => T,
    signal?: AbortSignal
): Promise<T> {
    const call: Request = {
        id: ++nextId,
        operation,
        method,
        url,
        ...(body === undefined ? {} : { body: clone(body) }),
        status: 'pending',
        startedAt: performance.now()
    }
    calls.push(call)
    return new Promise<T>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined
        const finish = (status: Request['status']) => {
            if (!pending.has(call.id)) return false
            pending.delete(call.id)
            clearTimeout(timer)
            signal?.removeEventListener('abort', abort)
            call.status = status
            call.finishedAt = performance.now()
            return true
        }
        const abort = () => {
            if (finish('aborted')) reject(new DOMException('Fixture request aborted', 'AbortError'))
        }
        const rejectRequest = (message = 'Synthetic API failure') => {
            if (finish('error')) reject(new Error(message))
        }
        const resolveRequest = (response?: unknown) => {
            if (!pending.has(call.id)) return
            if (failures.has(operation)) {
                const message = failures.get(operation)
                failures.delete(operation)
                rejectRequest(message)
                return
            }
            try {
                const result = response === undefined ? execute() : (response as T)
                if (finish('success')) resolve(clone(result))
            } catch (error) {
                if (finish('error')) reject(error)
            }
        }
        pending.set(call.id, { request: call, resolve: resolveRequest, reject: rejectRequest })
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) abort()
        else if (!held.has(operation))
            timer = setTimeout(resolveRequest, delays.get(operation) ?? 0)
    })
}

export const instance = {
    get<T>(url: string, options?: { signal?: AbortSignal }) {
        if (url !== '/api/geofiles') throw new Error('Unexpected synthetic GET ' + url)
        return request(
            'filesGET',
            'GET',
            url,
            undefined,
            () => ({ data: { response: files } as T }),
            options?.signal
        )
    },
    post<T>(url: string, body?: { name: string; kind: string; url: string }) {
        return request('fileMutation', 'POST', url, body, () => {
            if (url === '/api/geofiles/import' && body) {
                const source = defaultSources.find(
                    (value) => value.kind === body.kind && value.url === body.url
                )
                if (!source) throw new Error('Unknown synthetic default source')
                const file = defaultFiles().find((value) => value.id === source.id)!
                files = [...files.filter((value) => value.id !== file.id), file]
                return { data: { response: file } as T }
            }
            const file = files.find((value) => url === `/api/geofiles/${value.id}/refresh`)
            if (!file) throw new Error('Unknown synthetic file refresh ' + url)
            file.refresh!.lastSuccessAt = new Date().toISOString()
            return { data: { response: { updated: true } } as T }
        })
    },
    patch<T>(url: string, body: Partial<NonNullable<Geofile['refresh']>>) {
        return request('fileMutation', 'PATCH', url, body, () => {
            const file = files.find((value) => url === `/api/geofiles/${value.id}/refresh`)
            if (!file) throw new Error('Unknown synthetic file schedule ' + url)
            file.refresh = { ...file.refresh!, ...clone(body) }
            return { data: { response: file } as T }
        })
    }
}

export function useGetSubscriptionSettings(params?: {
    rQueryParams?: Partial<UseQueryOptions<Settings>>
}) {
    return useQuery({
        staleTime: 30_000,
        refetchOnMount: false,
        ...params?.rQueryParams,
        queryKey: settingsKey,
        queryFn: ({ signal }) =>
            request(
                'settingsGET',
                'GET',
                '/api/subscription-settings',
                undefined,
                () => settings,
                signal
            )
    })
}

type MutationInput = { variables: Partial<Settings> }
type MutationCallbacks = {
    onSuccess?: (
        data: Settings,
        variables: MutationInput,
        context: unknown,
        client: QueryClient
    ) => unknown
    onError?: (
        error: Error,
        variables: MutationInput,
        context: unknown,
        client: QueryClient
    ) => unknown
    onSettled?: (
        data: Settings | undefined,
        error: Error | null,
        variables: MutationInput,
        context: unknown,
        client: QueryClient
    ) => unknown
}
type MutationConfiguration = {
    rMutationParams?: MutationCallbacks & {
        mutationKey?: readonly unknown[]
        scope?: { id: string }
    }
    [key: string]: unknown
}
export function useSettingsMutation(
    configuration: MutationConfiguration,
    params?: { mutationFns?: MutationCallbacks }
) {
    const defaults = configuration.rMutationParams
    return useMutation({
        mutationKey: defaults?.mutationKey,
        scope: defaults?.scope,
        mutationFn: ({ variables }: MutationInput) =>
            request('settingsMutation', 'PATCH', '/api/subscription-settings', variables, () => {
                settings = { ...settings, ...clone(variables) }
                return settings
            }),
        onSuccess: async (data, variables, context) => {
            await defaults?.onSuccess?.(data, variables, context, queryClient)
            await params?.mutationFns?.onSuccess?.(data, variables, context, queryClient)
        },
        onError: (error: Error, variables, context) => {
            defaults?.onError?.(error, variables, context, queryClient)
            params?.mutationFns?.onError?.(error, variables, context, queryClient)
        },
        onSettled: (data, error, variables, context) =>
            defaults?.onSettled?.(data, error, variables, context, queryClient)
    })
}

export const boundary = {
    configure(values: Partial<Settings>, options: { publish?: boolean } = {}) {
        settings = { ...settings, ...clone(values) }
        if (options.publish !== false) queryClient.setQueryData(settingsKey, clone(settings))
    },
    setFiles(values: Geofile[], options: { publish?: boolean } = {}) {
        files = clone(values)
        if (options.publish !== false) queryClient.setQueryData(['template-geofiles'], clone(files))
    },
    hold(operation: Operation, value = true) {
        if (value) held.add(operation)
        else held.delete(operation)
    },
    delay(operation: Operation, milliseconds: number) {
        if (!Number.isFinite(milliseconds) || milliseconds < 0)
            throw new Error('Invalid fixture delay')
        delays.set(operation, milliseconds)
    },
    failNext(operation: Operation, message = 'Synthetic API failure') {
        failures.set(operation, message)
    },
    resolve(id: number, response?: unknown) {
        const entry = pending.get(id)
        if (!entry) throw new Error('No pending synthetic request ' + id)
        entry.resolve(response)
    },
    reject(id: number, message?: string) {
        const entry = pending.get(id)
        if (!entry) throw new Error('No pending synthetic request ' + id)
        entry.reject(message)
    },
    resolveAll(operation: Operation) {
        for (const entry of pending.values()) {
            if (entry.request.operation === operation) entry.resolve()
        }
    },
    snapshot() {
        return {
            settings: clone(settings),
            cache: clone(queryClient.getQueryData<Settings>(settingsKey)),
            files: clone(files),
            calls: clone(calls),
            pending: [...pending.values()].map((value) => clone(value.request)),
            query: queryClient.getQueryState(settingsKey)
                ? {
                      status: queryClient.getQueryState(settingsKey)!.status,
                      fetchStatus: queryClient.getQueryState(settingsKey)!.fetchStatus
                  }
                : null
        }
    },
    async refetchSettings() {
        await queryClient.invalidateQueries({ queryKey: settingsKey })
    },
    async reset(values: Partial<Settings> = {}, options: { seed?: boolean } = {}) {
        await queryClient.cancelQueries()
        for (const entry of pending.values()) entry.reject('Synthetic fixture reset')
        held.clear()
        delays.clear()
        failures.clear()
        calls.length = 0
        settings = { ...clone(initialSettings), ...clone(values) }
        files = defaultFiles()
        queryClient.removeQueries()
        queryClient.getMutationCache().clear()
        if (options.seed !== false) queryClient.setQueryData(settingsKey, clone(settings))
    }
}

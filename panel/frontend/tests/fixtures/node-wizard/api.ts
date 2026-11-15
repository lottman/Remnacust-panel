import type { CreateValues } from './types'

import { CreateNodeCommand } from '@remnawave/backend-contract'
import { QueryClient } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import { useState } from 'react'

import { RequestError } from '../../../src/shared/api/helpers/handler-request-error'

export const profileUuid = '11111111-1111-4111-8111-111111111111'
export const inboundUuid = '22222222-2222-4222-8222-222222222222'
export const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
})
export const setAuthorizationToken = () => {}
export const hasAuthorizationToken = () => false
export const clearQueryClient = () => queryClient.clear()
export const instance = {
    get: async () => ({ data: { response: [] } }),
    post: async () => {
        throw new Error('Unexpected fixture API request')
    }
}
export const QueryKeys = { nodes: { getAllNodes: { queryKey: ['fixture-nodes'] } } }
export const configProfilesQueryKeys = { getConfigProfiles: { queryKey: ['fixture-profiles'] } }
export const mutation = {
    calls: [] as CreateValues[],
    requests: [] as CreateValues[],
    pending: false,
    successes: 0,
    errors: 0,
    invalidCalls: 0,
    resolve: () => {},
    reject: (_code = 'A034') => {},
    reset() {
        this.calls = []
        this.requests = []
        this.pending = false
        this.successes = 0
        this.errors = 0
        this.invalidCalls = 0
    }
}
export function useCreateNode({
    mutationFns
}: {
    mutationFns: {
        onError?: (error: unknown) => void
        onSuccess?: (data: { uuid: string }) => void
    }
}) {
    const [isPending, setPending] = useState(false)
    return {
        isPending,
        mutate: (input: { variables: CreateValues }) => {
            mutation.calls.push(structuredClone(input.variables))
            const parsed = CreateNodeCommand.RequestBodySchema.safeParse(input.variables)
            if (!parsed.success) {
                mutation.invalidCalls++
                mutationFns.onError?.(
                    new Error('Synthetic boundary rejected invalid create values')
                )
                return
            }
            mutation.requests.push(parsed.data)
            mutation.pending = true
            setPending(true)
            mutation.resolve = () => {
                mutation.pending = false
                mutation.successes++
                setPending(false)
                mutationFns.onSuccess?.({ uuid: '33333333-3333-4333-8333-333333333333' })
            }
            mutation.reject = (code = 'A034') => {
                mutation.pending = false
                mutation.errors++
                setPending(false)
                const error = new AxiosError(
                    'Synthetic API rejection',
                    'ERR_BAD_REQUEST',
                    undefined,
                    undefined,
                    {
                        status: 409,
                        data: { errorCode: code, message: 'Synthetic API rejection' },
                        headers: {},
                        config: { headers: new AxiosHeaders() },
                        statusText: 'Conflict'
                    }
                )
                mutationFns.onError?.(new RequestError(error))
            }
        }
    }
}
export const useGetNodeSecretKey = () => ({
    data: { secretKey: 'fixture-only-masked-secret' },
    isLoading: false
})
export const useGetNodePlugins = () => ({ data: { nodePlugins: [] }, isLoading: false })
export const useGetNodesTags = () => ({ data: [], isLoading: false })
export const useGetInfraProviders = () => ({ data: { providers: [] }, isLoading: false })
export const useGetConfigProfiles = () => ({
    isLoading: false,
    data: {
        configProfiles: [
            {
                uuid: profileUuid,
                name: 'Synthetic profile',
                config: {},
                nodes: [],
                inbounds: [
                    {
                        uuid: inboundUuid,
                        profileUuid,
                        tag: 'fixture-vless',
                        type: 'vless',
                        port: 443,
                        network: 'tcp',
                        security: 'none'
                    }
                ]
            }
        ]
    }
})
export const useGetNode = () => ({
    isLoading: false,
    data: {
        uuid: '33333333-3333-4333-8333-333333333333',
        isConnected: true,
        isConnecting: false,
        lastStatusMessage: null
    }
})
export const selectedXrayMode = () => 'custom' as const
export const loadXrayMode = async () => ({ mode: 'custom', revision: 1 })

import { createQueryKeys } from '@lukemorales/query-key-factory'
import {
    GetExternalSquadByUuidCommand,
    GetExternalSquadsCommand,
    GetExternalSquadsTagsCommand
} from '@remnawave/backend-contract'
import { keepPreviousData } from '@tanstack/react-query'
import { z } from 'zod'

import { sToMs } from '@shared/utils/time-utils'

import { createGetQueryHook, errorHandler } from '../../tsq-helpers'

const GetExternalSquadsResponseSchema = z.preprocess((payload) => {
    if (!payload || typeof payload !== 'object') return payload

    const response = (payload as { response?: { externalSquads?: unknown } }).response
    if (!response || !Array.isArray(response.externalSquads)) return payload

    return {
        ...(payload as object),
        response: {
            ...response,
            externalSquads: response.externalSquads.map((squad) => {
                if (!squad || typeof squad !== 'object') return squad

                const item = squad as Record<string, unknown>
                return {
                    ...item,
                    responseHeadersAdd: item.responseHeadersAdd ?? item.responseHeaders ?? {},
                    responseHeadersRemove: item.responseHeadersRemove ?? []
                }
            })
        }
    }
}, GetExternalSquadsCommand.ResponseSchema)

export const externalSquadsQueryKeys = createQueryKeys('externalSquads', {
    getExternalSquadsTags: {
        queryKey: null
    },
    getExternalSquads: {
        queryKey: null
    },
    getExternalSquad: (route: GetExternalSquadByUuidCommand.RequestParam) => ({
        queryKey: [route]
    })
})

export const useGetExternalSquads = createGetQueryHook({
    endpoint: GetExternalSquadsCommand.TSQ_url,
    responseSchema: GetExternalSquadsResponseSchema,
    getQueryKey: () => externalSquadsQueryKeys.getExternalSquads.queryKey,
    rQueryParams: {
        placeholderData: keepPreviousData,
        refetchOnMount: true,
        staleTime: sToMs(30)
    },

    errorHandler: (error) => errorHandler(error, 'Get All External Squads')
})

export const useGetExternalSquad = createGetQueryHook({
    endpoint: GetExternalSquadByUuidCommand.TSQ_url,
    responseSchema: GetExternalSquadByUuidCommand.ResponseSchema,
    routeParamsSchema: GetExternalSquadByUuidCommand.RequestParamSchema,
    getQueryKey: ({ route }) => externalSquadsQueryKeys.getExternalSquad(route!).queryKey,
    rQueryParams: {
        refetchOnMount: false,
        staleTime: sToMs(30)
    },
    errorHandler: (error) => errorHandler(error, 'Get External Squad')
})

export const useGetExternalSquadsTags = createGetQueryHook({
    endpoint: GetExternalSquadsTagsCommand.TSQ_url,
    responseSchema: GetExternalSquadsTagsCommand.ResponseSchema,
    getQueryKey: () => externalSquadsQueryKeys.getExternalSquadsTags.queryKey,
    rQueryParams: {
        refetchOnMount: true,
        staleTime: sToMs(30)
    },
    errorHandler: (error) => errorHandler(error, 'Get ExternalSquads Tags')
})

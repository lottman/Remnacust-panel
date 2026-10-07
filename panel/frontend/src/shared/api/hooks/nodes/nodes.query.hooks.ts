import { createQueryKeys } from '@lukemorales/query-key-factory'
import {
    GetNodeMetadataCommand,
    GetNodeCommand,
    GetNodeSecretKeyCommand,
    GetNodesTagsCommand,
    GetNodesCommand,
    GetTrafficPathsCommand
} from '@remnawave/backend-contract'
import { keepPreviousData } from '@tanstack/react-query'
import { z } from 'zod'

import { sToMs } from '@shared/utils/time-utils'

import { createGetQueryHook, errorHandler } from '../../tsq-helpers'

export const nodesQueryKeys = createQueryKeys('nodes', {
    getAllNodes: {
        queryKey: null
    },
    getTrafficPaths: (query: GetTrafficPathsCommand.RequestQuery) => ({
        queryKey: [query]
    }),
    getNode: (route: GetNodeCommand.RequestParam) => ({
        queryKey: [route]
    }),
    getNodeSecretKey: {
        queryKey: null
    },
    getAllTags: {
        queryKey: null
    },
    getNodeMetadata: (route: GetNodeMetadataCommand.RequestParams) => ({
        queryKey: [route]
    })
})

export const useGetNodes = createGetQueryHook({
    endpoint: GetNodesCommand.TSQ_url,
    responseSchema: GetNodesCommand.ResponseSchema,
    getQueryKey: () => nodesQueryKeys.getAllNodes.queryKey,
    rQueryParams: {
        refetchOnMount: true,
        staleTime: sToMs(5)
    },
    errorHandler: (error) => errorHandler(error, 'Get All Nodes')
})

export const useGetNode = createGetQueryHook({
    endpoint: GetNodeCommand.TSQ_url,
    responseSchema: GetNodeCommand.ResponseSchema,
    routeParamsSchema: GetNodeCommand.RequestParamSchema,
    getQueryKey: ({ route }) => nodesQueryKeys.getNode(route!).queryKey,
    rQueryParams: {
        refetchOnMount: true,
        staleTime: sToMs(5),
        refetchInterval: sToMs(5)
    },
    errorHandler: (error) => errorHandler(error, 'Get Node')
})
export const useGetNodeSecretKey = createGetQueryHook({
    endpoint: GetNodeSecretKeyCommand.TSQ_url,
    responseSchema: GetNodeSecretKeyCommand.ResponseSchema,
    getQueryKey: () => nodesQueryKeys.getNodeSecretKey.queryKey,
    rQueryParams: {
        placeholderData: keepPreviousData,
        refetchOnMount: true,
        staleTime: sToMs(5),
        refetchInterval: sToMs(5)
    },

    errorHandler: (error) => errorHandler(error, 'Get PubKey')
})

export const useGetNodesTags = createGetQueryHook({
    endpoint: GetNodesTagsCommand.TSQ_url,
    responseSchema: GetNodesTagsCommand.ResponseSchema,
    getQueryKey: () => nodesQueryKeys.getAllTags.queryKey,
    rQueryParams: {
        staleTime: 0
    },
    errorHandler: (error) => errorHandler(error, 'Get All Nodes Tags')
})

export const useGetNodeMetadata = createGetQueryHook({
    endpoint: GetNodeMetadataCommand.TSQ_url,
    responseSchema: GetNodeMetadataCommand.ResponseSchema,
    routeParamsSchema: GetNodeMetadataCommand.RequestParamsSchema,
    getQueryKey: ({ route }) => nodesQueryKeys.getNodeMetadata(route!).queryKey,
    rQueryParams: {
        staleTime: sToMs(60)
    }
})

export const useGetTrafficPaths = createGetQueryHook({
    endpoint: GetTrafficPathsCommand.TSQ_url,
    responseSchema: GetTrafficPathsCommand.ResponseSchema.extend({
        response: GetTrafficPathsCommand.ResponseSchema.shape.response.extend({
            user: GetTrafficPathsCommand.ResponseSchema.shape.response.shape.user
                .unwrap()
                .extend({ activeInternalSquadUuids: z.array(z.string()).optional() })
                .nullable()
        })
    }),
    requestQuerySchema: GetTrafficPathsCommand.RequestQuerySchema,
    getQueryKey: ({ query }) => nodesQueryKeys.getTrafficPaths(query!).queryKey,
    rQueryParams: {
        refetchOnMount: true,
        staleTime: sToMs(15)
    },
    errorHandler: (error) => errorHandler(error, 'Get Traffic Paths')
})

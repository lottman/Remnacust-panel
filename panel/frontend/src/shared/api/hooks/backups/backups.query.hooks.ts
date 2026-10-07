import { createQueryKeys } from '@lukemorales/query-key-factory'
import {
    GetBackupSettingsCommand,
    GetBackupsCommand
} from '@remnawave/backend-contract'

import { createGetQueryHook, errorHandler } from '../../tsq-helpers'

export const backupsQueryKeys = createQueryKeys('backups', {
    getBackups: {
        queryKey: null
    },
    getBackupSettings: {
        queryKey: null
    }
})

export const useGetBackups = createGetQueryHook({
    endpoint: GetBackupsCommand.TSQ_url,
    responseSchema: GetBackupsCommand.ResponseSchema,
    getQueryKey: () => backupsQueryKeys.getBackups.queryKey,
    rQueryParams: {
        refetchOnMount: true
    },
    errorHandler: (error) => errorHandler(error, 'Get Backups')
})

export const useGetBackupSettings = createGetQueryHook({
    endpoint: GetBackupSettingsCommand.TSQ_url,
    responseSchema: GetBackupSettingsCommand.ResponseSchema,
    getQueryKey: () => backupsQueryKeys.getBackupSettings.queryKey,
    rQueryParams: {
        refetchOnMount: true
    },
    errorHandler: (error) => errorHandler(error, 'Get Backup Settings')
})

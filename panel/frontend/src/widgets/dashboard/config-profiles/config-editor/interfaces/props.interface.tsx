import { GetConfigProfileByUuidCommand, GetSnippetsCommand } from '@remnawave/backend-contract'

export interface IProps {
    configProfile: GetConfigProfileByUuidCommand.Response['response']
    isWasmCrashed: boolean
    isWasmLoading: boolean
    isWasmRestarting: boolean
    onRestartWasm: () => void
    snippets: GetSnippetsCommand.Response['response']
    restoreDraft?: { uuid: string; config?: unknown; code?: string } | null
    onDraftChange?: (code: string) => void
    onSaved?: (code: string, submitted: string) => Promise<void>
}

import type { mutation } from './api'
import type { UseFormReturnType } from '@mantine/form'
import type { CreateNodeCommand, TNodeIp } from '@remnawave/backend-contract'
import type { i18n } from 'i18next'

export type CreateValues = CreateNodeCommand.RequestBody
export type AddressEntry = { address: string; enabled: boolean }
export type EditorValues = CreateValues & { address: string; ips: TNodeIp[] }
export interface WizardFixture {
    observedForms: Map<string, unknown>
    mutation: typeof mutation
    profileUuid: string
    inboundUuid: string
    i18n: i18n
    form(): UseFormReturnType<CreateValues>
    open(): Promise<unknown>
    close(): void
    chooseProfile(): void
    snapshot(): { calls: CreateValues[]; [key: string]: unknown }
    browserCaseNames: string[]
    runCase(name: string): Promise<unknown>
}

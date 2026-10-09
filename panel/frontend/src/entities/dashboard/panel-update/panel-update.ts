import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { z } from 'zod'
import { create } from 'zustand'

import { instance } from '@shared/api/axios'
import { isPanelVersionNewer, isValidPanelVersion } from '@shared/utils/panel-version'

export const panelUpdateSchema = z.object({
    available: z.boolean(),
    installedVersion: z.string().nullable(),
    active: z.boolean(),
    phase: z.enum(['idle', 'queued', 'checking', 'updating', 'completed', 'failed']),
    jobId: z.string().uuid().nullable(),
    targetVersion: z.string().nullable(),
    error: z.string().nullable()
})
export type PanelUpdateStatus = z.infer<typeof panelUpdateSchema>
const key = ['panel-update-status'] as const
const storageKey = 'remnacust-panel-update-job'
const versionKey = storageKey + '-version'

function savedJob() {
    try {
        const value = sessionStorage.getItem(storageKey)
        return value && z.string().uuid().safeParse(value).success ? value : null
    } catch {
        return null
    }
}
function savedVersion() {
    try {
        const value = sessionStorage.getItem(versionKey)
        return value && isValidPanelVersion(value) ? value : null
    } catch {
        return null
    }
}
function remember(job: string | null, version: string | null = null) {
    try {
        if (job) sessionStorage.setItem(storageKey, job)
        else sessionStorage.removeItem(storageKey)
        if (job && version) sessionStorage.setItem(versionKey, version)
        else sessionStorage.removeItem(versionKey)
    } catch {}
}
export const usePanelUpdateStore = create<{
    status?: PanelUpdateStatus
    observedJob: string | null
    starting: boolean
    confirmed: boolean
    expectedVersion: string | null
    accept: (status: PanelUpdateStatus) => void
    start: (version: string) => Promise<void>
    dismiss: () => void
}>((set, get) => ({
    observedJob: savedJob(),
    starting: false,
    confirmed: Boolean(savedJob()),
    expectedVersion: savedVersion(),
    accept: (status) => {
        if (get().starting && !status.active && status.jobId !== get().observedJob) {
            set({ status })
            return
        }
        if (
            get().confirmed &&
            get().observedJob &&
            !status.active &&
            status.jobId !== get().observedJob
        ) {
            // A sleeping tab may miss completion and see a later job instead.
            const expected = get().expectedVersion
            if (
                expected &&
                status.installedVersion &&
                (status.installedVersion === expected ||
                    isPanelVersionNewer(status.installedVersion, expected))
            ) {
                remember(null)
                set({ status, observedJob: null, confirmed: false, expectedVersion: null })
                window.location.reload()
            }
            return
        }
        if (status.active && status.jobId) {
            remember(status.jobId, status.targetVersion)
            set({
                status,
                observedJob: status.jobId,
                confirmed: true,
                expectedVersion: status.targetVersion
            })
        } else if (status.phase === 'completed' && status.jobId === get().observedJob) {
            remember(null)
            set({ status, observedJob: null, confirmed: false, expectedVersion: null })
            window.location.reload()
        } else if (status.jobId === get().observedJob && status.phase === 'failed') {
            set({ status })
        } else {
            remember(null)
            set({ status, observedJob: null, confirmed: false, expectedVersion: null })
        }
    },
    start: async (version) => {
        if (get().starting || get().status?.active) return
        const requestId = crypto.randomUUID()
        set({ starting: true, observedJob: requestId, confirmed: false, expectedVersion: null })
        try {
            const result = await instance.post(
                '/api/system/update/start',
                { targetVersion: version, requestId },
                { timeout: 25000 }
            )
            get().accept(panelUpdateSchema.parse(result.data.response))
        } finally {
            // A lost response may follow an accepted job. The next status check decides.
            set({ starting: false })
            window.dispatchEvent(new Event('remnacust-panel-updating'))
        }
    },
    dismiss: () => {
        remember(null)
        set({ observedJob: null, confirmed: false, expectedVersion: null })
    }
}))

export function usePanelUpdateMonitor() {
    const accept = usePanelUpdateStore((state) => state.accept)
    const observed = usePanelUpdateStore((state) => state.observedJob)
    const client = useQueryClient()
    const query = useQuery({
        queryKey: key,
        queryFn: async () => {
            const result = await instance.get('/api/system/update/status', { timeout: 5000 })
            return panelUpdateSchema.parse(result.data.response)
        },
        retry: false,
        staleTime: 0,
        refetchInterval: observed ? 1500 : 5000,
        refetchIntervalInBackground: true
    })
    useEffect(() => {
        if (query.data) accept(query.data)
    }, [query.data, query.dataUpdatedAt, accept])
    useEffect(() => {
        const refresh = () => {
            void client.invalidateQueries({ queryKey: key })
        }
        window.addEventListener('remnacust-panel-updating', refresh)
        return () => window.removeEventListener('remnacust-panel-updating', refresh)
    }, [client])
}

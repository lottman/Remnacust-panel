import { z } from 'zod'

export const diagnosticsResponseSchema = z.object({
    response: z
        .object({
            sampledAt: z.iso.datetime().nullable(),
            status: z.enum(['ok', 'unavailable']),
            database: z
                .object({
                    version: z.string().regex(/^\d+\.\d+$/),
                    connections: z.number().int().nonnegative(),
                    activeQueries: z.number().int().nonnegative(),
                    lockWaits: z.number().int().nonnegative(),
                    idleInTransaction: z.number().int().nonnegative(),
                    longestQuerySeconds: z.number().nonnegative(),
                    visibility: z.enum(['complete', 'partial', 'disabled'])
                })
                .nullable()
        })
        .refine((value) =>
            value.status === 'ok'
                ? value.database !== null && value.sampledAt !== null
                : value.database === null && value.sampledAt === null
        )
})

export type DatabaseDiagnostics = NonNullable<
    z.infer<typeof diagnosticsResponseSchema>['response']['database']
>

export function databaseDiagnosticValues(database: DatabaseDiagnostics | null) {
    const complete = database?.visibility === 'complete'
    return {
        connections: database?.connections ?? '—',
        activeQueries: complete ? database.activeQueries : '—',
        lockWaits: complete ? database.lockWaits : '—',
        idleInTransaction: complete ? database.idleInTransaction : '—',
        longestQuerySeconds: complete ? database.longestQuerySeconds.toFixed(1) : '—'
    }
}

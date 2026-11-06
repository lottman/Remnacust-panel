import { z } from 'zod'

const address = z
    .string()
    .min(1)
    .max(253)
    .regex(/^[a-z0-9_.:[\]-]+$/i)

const connectionRouteSchema = z.object({
    status: z.enum(['authenticated', 'unavailable', 'disabled', 'unverified']),
    activeAddress: address.nullable(),
    port: z.number().int().min(1).max(65535).nullable(),
    viaProxy: z.boolean(),
    checkedAt: z.iso.datetime().nullable(),
    configurationRevision: z.string().min(1).max(128),
    attempts: z
        .array(
            z.object({
                address,
                status: z.enum(['authenticated', 'failed', 'skipped']),
                code: z.enum([
                    'authenticated',
                    'dns',
                    'refused',
                    'timeout',
                    'certificate',
                    'authorization',
                    'proxy',
                    'identity-mismatch',
                    'identity-unavailable',
                    'invalid-response',
                    'cooldown',
                    'busy',
                    'transport'
                ])
            })
        )
        .max(65)
})

export type ConnectionRoute = z.infer<typeof connectionRouteSchema>
export const ROUTE_OBSERVATION_MS = 10_000

export function parseConnectionRoute(value: unknown): ConnectionRoute | null {
    const parsed = connectionRouteSchema.safeParse(value)
    return parsed.success ? parsed.data : null
}

export function isRouteAuthenticated(route: ConnectionRoute, now: number): boolean {
    const age = now - Date.parse(route.checkedAt ?? '')
    return (
        route.status === 'authenticated' &&
        route.activeAddress !== null &&
        Number.isFinite(age) &&
        age >= 0 &&
        age < ROUTE_OBSERVATION_MS
    )
}

export function routeEndpoint(address: string, port: number | null): string {
    const host = address.includes(':') && !address.startsWith('[') ? `[${address}]` : address
    return port === null ? host : `${host}:${port}`
}

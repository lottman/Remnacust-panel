import { z } from 'zod'

export type NodeUpgradeRequest = {
    id: string
    directory: string
    operation?: 'upgrade' | 'install'
    netAdmin?: boolean
    panelIp?: string
}
export const nodeUpgradeEventSchema = z
    .object({
        t: z.literal('node-upgrade'),
        id: z.string().uuid(),
        status: z.enum(['running', 'succeeded', 'failed']),
        phase: z.enum(['preparing', 'downloading', 'updating', 'finished']),
        reason: z.enum(['root', 'directory', 'dependencies', 'download', 'installer', 'ssh', 'authorization', 'node', 'busy']).optional()
    })
    .strict()
export type NodeUpgradeEvent = z.infer<typeof nodeUpgradeEventSchema>

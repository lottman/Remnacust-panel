import { z } from 'zod'

export type NodeUpgradeRequest = {
    id: string
    directory: string
}
export const nodeUpgradeEventSchema = z
    .object({
        t: z.literal('node-upgrade'),
        id: z.string().uuid(),
        status: z.enum(['running', 'succeeded', 'failed']),
        phase: z.enum(['preparing', 'downloading', 'updating', 'finished'])
    })
    .strict()
export type NodeUpgradeEvent = z.infer<typeof nodeUpgradeEventSchema>

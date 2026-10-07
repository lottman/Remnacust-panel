import { z } from 'zod';

export const CORE_QUEUE = 'xera-core-management';
export const coreJobSchema = z
    .object({
        requestId: z.uuid(),
        nodeUuids: z
            .array(z.uuid())
            .min(1)
            .max(1000)
            .refine((ids) => new Set(ids).size === ids.length),
        action: z.enum([
            'install',
            'rollback',
            'bundled',
            'profile',
            'start',
            'stop',
            'restart',
            'check',
        ]),
        releaseId: z.string().max(100).optional(),
        stopOnFailure: z.boolean().default(true),
    })
    .strict()
    .refine((value) => value.action !== 'install' || !!value.releaseId, 'Select a release');
export type CoreJobRequest = z.infer<typeof coreJobSchema>;
export interface CoreJobData extends CoreJobRequest {
    nodes: { uuid: string; name: string }[];
}
export interface CoreOperation {
    id: string;
    action: string;
    phase: string;
    status: 'running' | 'succeeded' | 'failed' | 'rolled-back';
    error?: string;
}
export interface CoreStatus {
    capabilityVersion: number;
    platform: string;
    arch: string;
    mode: string;
    paused: boolean;
    online: boolean;
    selected: { sha256: string; version: string } | null;
    running: { sha256: string; version: string } | null;
    canRollback: boolean;
    operation: CoreOperation | null;
    history: CoreOperation[];
    sshTunnelAvailable?: boolean;
}
export interface CoreResult {
    uuid: string;
    name: string;
    status:
        | 'pending'
        | 'running'
        | 'succeeded'
        | 'failed'
        | 'rolled-back'
        | 'cancelled'
        | 'skipped';
    phase?: string;
    error?: string;
}

const releaseSchema = z.object({
    id: z.string().regex(/^[\w.+-]{1,100}$/),
    build: z.string().regex(/^[\w.+-]{1,100}$/),
    artifacts: z.record(
        z.enum(['amd64', 'arm64']),
        z.object({ url: z.url(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
    ),
});
export function coreCatalog() {
    return z
        .array(releaseSchema)
        .max(30)
        .parse(
            process.env.REMNACUST_CORE_CATALOG_JSON
                ? JSON.parse(process.env.REMNACUST_CORE_CATALOG_JSON)
                : [],
        );
}

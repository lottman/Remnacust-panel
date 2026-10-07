import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '@common/database/prisma.service';

type HealthStatus = 'ok' | 'retry' | 'unreachable' | 'xray_missing' | 'error';

interface HealthLogRow {
    id: bigint;
    node_uuid: string;
    checked_at: Date;
    status: HealthStatus;
    attempt: number;
    message: string | null;
    metrics: Record<string, number | null>;
}

@Injectable()
export class NodeHealthLogService {
    private readonly logger = new Logger(NodeHealthLogService.name);
    private lastCleanup = 0;

    constructor(private readonly prisma: PrismaService) {}

    async record(input: {
        nodeUuid: string;
        status: HealthStatus;
        attempt?: number;
        message?: string;
        metrics?: Record<string, number | null>;
    }): Promise<void> {
        const message = input.message
            ?.replace(/(bearer\s+|authorization\s*[:=]\s*)\S+/gi, '$1[redacted]')
            .replace(/:\/\/[^/@\s]+:[^/@\s]+@/g, '://[redacted]@')
            .replace(/([?&](?:token|password|secret|key)=)[^&\s]+/gi, '$1[redacted]')
            .slice(0, 500) ?? null;
        try {
            await this.prisma.$executeRaw`
                INSERT INTO xera_node_health_logs
                    (node_uuid, status, attempt, message, metrics)
                VALUES
                    (${input.nodeUuid}::uuid, ${input.status}, ${input.attempt ?? 1}, ${message}, ${JSON.stringify(input.metrics ?? {})}::jsonb)
            `;
            if (Date.now() - this.lastCleanup > 3_600_000) {
                this.lastCleanup = Date.now();
                await this.cleanup();
            }
        } catch (error) {
            this.logger.warn(`Could not save node health log: ${error}`);
        }
    }

    async list(nodeUuid: string, status: string, limit: number, beforeId: bigint | null) {
        const rows = await this.prisma.$queryRaw<HealthLogRow[]>`
            SELECT id, node_uuid, checked_at, status, attempt, message, metrics
            FROM xera_node_health_logs
            WHERE node_uuid = ${nodeUuid}::uuid
              AND (${status} = 'all' OR status = ${status})
              AND (${beforeId}::bigint IS NULL OR id < ${beforeId}::bigint)
            ORDER BY id DESC
            LIMIT ${limit}
        `;
        return rows.map((row) => ({
            id: row.id.toString(),
            nodeUuid: row.node_uuid,
            checkedAt: row.checked_at,
            status: row.status,
            attempt: row.attempt,
            message: row.message,
            metrics: row.metrics,
        }));
    }

    async retentionDays(): Promise<number> {
        const rows = await this.prisma.$queryRaw<Array<{ retention_days: number }>>`
            SELECT retention_days FROM xera_node_health_log_settings WHERE id = 1
        `;
        return rows[0]?.retention_days ?? 30;
    }

    async setRetentionDays(days: number): Promise<number> {
        if (!Number.isInteger(days) || days < 1 || days > 365) {
            throw new Error('Retention must be 1–365 days');
        }
        await this.prisma.$executeRaw`
            INSERT INTO xera_node_health_log_settings (id, retention_days)
            VALUES (1, ${days})
            ON CONFLICT (id) DO UPDATE SET retention_days = EXCLUDED.retention_days
        `;
        await this.cleanup();
        return days;
    }

    async clear(nodeUuid: string): Promise<number> {
        return this.prisma.$executeRaw`
            DELETE FROM xera_node_health_logs WHERE node_uuid = ${nodeUuid}::uuid
        `;
    }

    async cleanup(): Promise<void> {
        const days = await this.retentionDays();
        const cutoff = new Date(Date.now() - days * 86_400_000);
        await this.prisma.$executeRaw`
            DELETE FROM xera_node_health_logs WHERE checked_at < ${cutoff}
        `;
    }
}

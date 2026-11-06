import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '@common/database/prisma.service';

export interface DatabaseDiagnostics {
    version: string;
    connections: number;
    activeQueries: number;
    lockWaits: number;
    idleInTransaction: number;
    longestQuerySeconds: number;
    visibility: 'complete' | 'partial' | 'disabled';
}

export interface SystemDiagnostics {
    sampledAt: string | null;
    status: 'ok' | 'unavailable';
    database: DatabaseDiagnostics | null;
}

interface DiagnosticsRow {
    version: number;
    tracking: boolean;
    connections: number;
    active: number;
    locks: number;
    idle: number;
    unknown: number;
    longest: number;
}

@Injectable()
export class SystemDiagnosticsService {
    private readonly logger = new Logger(SystemDiagnosticsService.name);
    private cached?: SystemDiagnostics;
    private expiresAt = 0;
    private pending?: Promise<SystemDiagnostics>;
    private failureReported = false;

    constructor(private readonly prisma: PrismaService) {}

    getSnapshot(): Promise<SystemDiagnostics> {
        if (this.cached && performance.now() < this.expiresAt) return Promise.resolve(this.cached);
        if (this.pending) return this.pending;
        const pending = this.sample();
        this.pending = pending;
        void pending.then(
            () => {
                if (this.pending === pending) this.pending = undefined;
            },
            () => {
                if (this.pending === pending) this.pending = undefined;
            },
        );
        return pending;
    }

    private async sample(): Promise<SystemDiagnostics> {
        try {
            const rows = await this.prisma.$transaction(
                async (tx) => {
                    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
                    await tx.$executeRaw`SET LOCAL statement_timeout = '1000ms'`;
                    return tx.$queryRaw<DiagnosticsRow[]>`
                    SELECT current_setting('server_version_num')::integer AS version,
                        current_setting('track_activities')::boolean AS tracking,
                        COUNT(*)::integer AS connections,
                        COUNT(*) FILTER (WHERE state = 'active')::integer AS active,
                        COUNT(*) FILTER (WHERE wait_event_type = 'Lock')::integer AS locks,
                        COUNT(*) FILTER (WHERE state IN ('idle in transaction', 'idle in transaction (aborted)'))::integer AS idle,
                        COUNT(*) FILTER (WHERE state IS NULL OR state = 'disabled')::integer AS unknown,
                        GREATEST(COALESCE(MAX(EXTRACT(EPOCH FROM clock_timestamp() - query_start))
                            FILTER (WHERE state = 'active'), 0), 0)::double precision AS longest
                    FROM pg_catalog.pg_stat_activity
                    WHERE datname = current_database()
                        AND usesysid = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
                        AND backend_type = 'client backend'
                        AND pid <> pg_backend_pid()
                `;
                },
                { maxWait: 500, timeout: 2500 },
            );
            const row = rows[0];
            if (
                !row ||
                !Number.isInteger(row.version) ||
                row.version < 100000 ||
                typeof row.tracking !== 'boolean' ||
                [row.connections, row.active, row.locks, row.idle, row.unknown].some(
                    (value) => !Number.isSafeInteger(value) || value < 0,
                ) ||
                !Number.isFinite(row.longest) ||
                row.longest < 0
            )
                throw new Error('Invalid diagnostics sample');
            this.cached = {
                sampledAt: new Date().toISOString(),
                status: 'ok',
                database: {
                    version: `${Math.floor(row.version / 10000)}.${row.version % 10000}`,
                    connections: row.connections,
                    activeQueries: row.active,
                    lockWaits: row.locks,
                    idleInTransaction: row.idle,
                    longestQuerySeconds: row.longest,
                    visibility: !row.tracking
                        ? 'disabled'
                        : row.unknown > 0
                          ? 'partial'
                          : 'complete',
                },
            };
            this.expiresAt = performance.now() + 15000;
            this.failureReported = false;
        } catch {
            this.cached = { sampledAt: null, status: 'unavailable', database: null };
            this.expiresAt = performance.now() + 5000;
            if (!this.failureReported) this.logger.warn('Database diagnostics unavailable');
            this.failureReported = true;
        }
        return this.cached;
    }
}

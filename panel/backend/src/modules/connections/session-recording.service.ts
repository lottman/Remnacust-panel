import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    OnApplicationBootstrap,
    OnApplicationShutdown,
} from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config/typed-config.service';
import { PrismaService } from '@common/database/prisma.service';

import { NodesQueuesService } from '@queue/_nodes';

import {
    EMPTY_RECORDING,
    mergeObservations,
    RecordingState,
    SessionObservation,
} from './session-recording-state';

export interface RecordingRow {
    id: string;
    startedAt: Date;
    endsAt: Date;
    intervalSeconds: number;
    status: string;
    snapshot: RecordingState;
    token: string | null;
}

@Injectable()
export class SessionRecordingService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(SessionRecordingService.name);
    private timer?: ReturnType<typeof setInterval>;
    private busy = false;
    private stopping = false;

    constructor(
        private readonly db: PrismaService,
        private readonly queues: NodesQueuesService,
        private readonly config: TypedConfigService,
    ) {}

    onApplicationBootstrap() {
        if (process.env.INSTANCE_TYPE && process.env.INSTANCE_TYPE !== 'api') return;
        this.timer = setInterval(() => {
            void this.tick();
        }, 5000);
        this.timer.unref();
        void this.tick();
    }

    onApplicationShutdown() {
        this.stopping = true;
        clearInterval(this.timer);
    }

    async list() {
        return this.db.$queryRaw<
            Array<
                Omit<RecordingRow, 'snapshot' | 'token'> & {
                    observations: number;
                    polls: number;
                    failedNodePolls: number;
                    offlineNodePolls: number;
                    truncated: boolean;
                }
            >
        >`SELECT id, started_at AS "startedAt", ends_at AS "endsAt",
            interval_seconds AS "intervalSeconds", status,
            jsonb_array_length(snapshot->'observations') AS observations,
            snapshot->'polls' AS polls, snapshot->'failedNodePolls' AS "failedNodePolls",
            snapshot->'offlineNodePolls' AS "offlineNodePolls", snapshot->'truncated' AS truncated
            FROM xera_session_recordings WHERE expires_at > now() ORDER BY started_at DESC LIMIT 20`;
    }

    async start(body: unknown) {
        const input = body as { durationMinutes?: number; intervalSeconds?: number } | null;
        if (
            !input ||
            !Number.isInteger(input.durationMinutes) ||
            !Number.isInteger(input.intervalSeconds) ||
            input.durationMinutes! < 1 ||
            input.durationMinutes! > 10080 ||
            input.intervalSeconds! < 10 ||
            input.intervalSeconds! > 300
        ) {
            throw new BadRequestException('Duration: 1–10080 minutes; interval: 10–300 seconds');
        }
        const id = randomUUID();
        // Serialize starts across API replicas; also bounds retained recordings and DB use.
        await this.db.$transaction(async (tx) => {
            await tx.$executeRaw`LOCK TABLE xera_session_recordings IN SHARE ROW EXCLUSIVE MODE`;
            await tx.$executeRaw`DELETE FROM xera_session_recordings WHERE expires_at <= now()`;
            const count = await tx.$queryRaw<Array<{ active: bigint; total: bigint }>>`
                SELECT count(*) FILTER (WHERE status = 'running') AS active, count(*) AS total
                FROM xera_session_recordings`;
            if (Number(count[0].active))
                throw new ConflictException('A recording is already running');
            if (Number(count[0].total) >= 20)
                throw new ConflictException('Delete an old recording first');
            await tx.$executeRaw`INSERT INTO xera_session_recordings
                (id, ends_at, interval_seconds, snapshot, expires_at)
                VALUES (${id}::uuid, now() + ${input.durationMinutes!} * interval '1 minute',
                ${input.intervalSeconds!}, ${JSON.stringify(EMPTY_RECORDING())}::jsonb,
                now() + (${input.durationMinutes!} * interval '1 minute') + interval '3 days')`;
        });
        void this.tick();
        return { id };
    }

    private validateId(id: string) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
            throw new BadRequestException('Invalid recording ID');
        }
    }

    async stop(id: string) {
        this.validateId(id);
        const count = await this.db.$executeRaw`UPDATE xera_session_recordings
            SET ends_at = LEAST(ends_at, now()), next_poll_at = now(), expires_at = now() + interval '3 days',
                status = CASE WHEN lease_until IS NULL OR lease_until < now() THEN 'completed' ELSE status END
            WHERE id = ${id}::uuid AND status = 'running'`;
        if (!count) throw new NotFoundException('Active recording not found');
        void this.tick();
        return { id };
    }

    async remove(id: string) {
        this.validateId(id);
        const count = await this.db
            .$executeRaw`DELETE FROM xera_session_recordings WHERE id = ${id}::uuid`;
        if (!count) throw new NotFoundException('Recording not found');
        return { id };
    }

    async users(ids: number[]) {
        if (
            !Array.isArray(ids) ||
            ids.length > 1000 ||
            ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
        ) {
            throw new BadRequestException('Expected up to 1000 positive user IDs');
        }
        const users = await this.db.users.findMany({
            where: { id: { in: ids.map(BigInt) } },
            select: { id: true, username: true, shortUuid: true, status: true },
        });
        const domain = this.config.getOrThrow('SUB_PUBLIC_DOMAIN');
        return users.map((user) => ({
            ...user,
            id: Number(user.id),
            shortUuid: undefined,
            subscriptionUrl: `https://${domain}/${user.shortUuid}`,
        }));
    }

    async export(id: string) {
        this.validateId(id);
        const rows = await this.db.$queryRaw<RecordingRow[]>`SELECT id, started_at AS "startedAt",
            ends_at AS "endsAt", interval_seconds AS "intervalSeconds", status, snapshot
            FROM xera_session_recordings WHERE id = ${id}::uuid AND expires_at > now()`;
        const row = rows[0];
        if (!row) throw new NotFoundException('Recording not found');
        const ids = [...new Set(row.snapshot.observations.map((item) => item.userId))];
        const users = [];
        for (let offset = 0; offset < ids.length; offset += 1000) {
            users.push(...(await this.users(ids.slice(offset, offset + 1000))));
        }
        const userMap = new Map(users.map((user) => [user.id, user]));
        const grouped = new Map<number, SessionObservation[]>();
        for (const observation of row.snapshot.observations) {
            const entries = grouped.get(observation.userId) ?? [];
            entries.push(observation);
            grouped.set(observation.userId, entries);
        }
        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            recording: row,
            users: ids.map((userId) => ({
                userId,
                ...(userMap.get(userId) ?? {
                    username: null,
                    subscriptionUrl: null,
                    deleted: true,
                }),
                observations: grouped.get(userId),
            })),
        };
    }

    private async tick() {
        if (this.busy || this.stopping) return;
        this.busy = true;
        const token = randomUUID();
        try {
            await this.db
                .$executeRaw`DELETE FROM xera_session_recordings WHERE expires_at <= now()`;
            const rows = await this.db.$queryRaw<RecordingRow[]>`UPDATE xera_session_recordings
                SET token = ${token}, lease_until = now() + interval '3 minutes'
                WHERE id = (SELECT id FROM xera_session_recordings WHERE status = 'running'
                    AND next_poll_at <= now() AND (lease_until IS NULL OR lease_until < now())
                    ORDER BY started_at LIMIT 1 FOR UPDATE SKIP LOCKED)
                RETURNING id, started_at AS "startedAt", ends_at AS "endsAt",
                    interval_seconds AS "intervalSeconds", status, snapshot, token`;
            const row = rows[0];
            if (!row) return;
            if (row.endsAt.getTime() > Date.now()) await this.sample(row);
            const state = row.snapshot;
            await this.db.$executeRaw`UPDATE xera_session_recordings SET
                snapshot = ${JSON.stringify(state)}::jsonb, token = NULL, lease_until = NULL,
                next_poll_at = now() + interval_seconds * interval '1 second',
                expires_at = CASE WHEN ${state.truncated} THEN now() + interval '3 days' ELSE expires_at END,
                ends_at = CASE WHEN ${state.truncated} THEN LEAST(ends_at, now()) ELSE ends_at END,
                status = CASE WHEN ends_at <= now() OR ${state.truncated} THEN 'completed' ELSE 'running' END
                WHERE id = ${row.id}::uuid AND token = ${token}`;
        } catch {
            // No user identifiers, subscription secrets or node addresses in operational logs.
            this.logger.error('Session recording poll failed; the persisted lease allows retry');
        } finally {
            this.busy = false;
        }
    }

    private async sample(row: RecordingRow) {
        const nodes = await this.db.nodes.findMany({
            where: { isDisabled: false },
            select: { uuid: true, name: true, countryCode: true, isConnected: true },
        });
        const state = row.snapshot;
        state.polls++;
        state.lastFailures = [];
        state.offlineNodePolls += nodes.filter((node) => !node.isConnected).length;
        const online = nodes.filter((node) => node.isConnected);
        let cursor = 0;
        const deadline = Date.now() + 90_000;
        await Promise.all(
            Array.from({ length: Math.min(10, online.length) }, async () => {
                while (cursor < online.length && !this.stopping) {
                    const node = online[cursor++];
                    try {
                        if (Date.now() >= deadline) throw new Error('Scan deadline');
                        const job = await this.queues.connectionsByNode({ nodeUuid: node.uuid });
                        if (!job) throw new Error('No job');
                        const nodeDeadline = Math.min(deadline, Date.now() + 25_000);
                        let done = false;
                        while (Date.now() < nodeDeadline && !this.stopping) {
                            const result = await this.queues.connectionsByNodeResult(job.jobId);
                            if (result?.isFailed) throw new Error('Failed job');
                            if (result?.isCompleted) {
                                if (!result.result?.success) throw new Error('Failed node');
                                if (result.result.unmappedUsers) {
                                    state.failedNodePolls++;
                                    if (state.lastFailures.length < 100) state.lastFailures.push(node.uuid);
                                }
                                const observedAt = new Date().toISOString();
                                const incoming = result.result.users.flatMap((user) =>
                                    user.ips.map((ip) => ({
                                        userId: user.userId,
                                        nodeUuid: node.uuid,
                                        nodeName: node.name,
                                        countryCode: node.countryCode,
                                        ip: ip.ip,
                                        lastSeen: String(ip.lastSeen),
                                        firstObservedAt: observedAt,
                                        lastObservedAt: observedAt,
                                        samples: 1,
                                    })),
                                );
                                mergeObservations(state, incoming);
                                done = true;
                                break;
                            }
                            await sleep(1000);
                        }
                        if (!done) throw new Error('Poll timeout');
                    } catch {
                        state.failedNodePolls++;
                        if (state.lastFailures.length < 100) state.lastFailures.push(node.uuid);
                    }
                }
            }),
        );
    }
}

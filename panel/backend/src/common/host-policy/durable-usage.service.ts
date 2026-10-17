import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';

import { Injectable } from '@nestjs/common';

import { AxiosService } from '@common/axios';
import { INodeConnectionOpts } from '@common/axios/axios.interfaces';
import { TypedConfigService } from '@common/config/app-config';
import { TxKyselyService } from '@common/database';
import { usageOwner } from '@common/utils/device-identity';
import { parseHostIdentity } from '@common/utils/host-identity';
import { multiplyConsumption } from '@common/utils/nano';

import { UNRESERVED_PREFIX, parseUnreservedUsageCounter } from './unreserved-usage';
import { parseUsageReceiptResponse, UsageReceiptRequest } from './usage-receipt';

type Stream = {
    stream: string;
    node: string;
    nodeId: string;
    sequence: string;
    core: string | null;
    requestedAt: Date | null;
    multiplier: string | null;
    digest: string | null;
    effects: UsageEffects | null;
};
export type UsageEffects = {
    owners: { id: string; bytes: string }[];
    firstConnected: string[];
    capturedAt: string;
};
export type UsageNode = {
    nodeUuid: string;
    nodeId: bigint;
    opts: INodeConnectionOpts;
    multiplier: string;
};
const maxInt64 = 9223372036854775807n;

@Injectable()
export class DurableUsageService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly axios: AxiosService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly config: TypedConfigService,
    ) {}

    async isManaged(node: string) {
        const result =
            await sql`SELECT 1 FROM xera_quota_node_modes WHERE node_uuid=${node}::uuid`.execute(
                this.db.kysely,
            );
        return result.rows.length > 0;
    }

    async assertBillingAllowed() {
        await sql`SELECT 1 FROM xera_assert_quota_restore_reconciled()`.execute(this.db.kysely);
    }

    private async lock(nodeId: bigint) {
        // The same lock is used by legacy collection and by the first cutover.
        await sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${nodeId.toString()},20261016))`.execute(
            this.db.kysely,
        );
    }

    private async stream(node: string) {
        const result =
            await sql<Stream>`SELECT stream_id AS stream,node_uuid AS node,node_id::text AS "nodeId",
            next_sequence::text AS sequence,expected_core AS core,requested_at AS "requestedAt",
            consumption_multiplier::text AS multiplier,committed_digest AS digest,pending_effects AS effects
            FROM xera_node_usage_streams WHERE node_uuid=${node}::uuid FOR UPDATE`.execute(
                this.db.kysely,
            );
        return result.rows[0];
    }

    async collect(
        node: UsageNode,
        effects: (receipt: string, value: UsageEffects) => Promise<void>,
    ) {
        if (this.transactions.isTransactionActive())
            throw new Error('Usage receipts require committed standalone transactions');
        if (!(await this.isManaged(node.nodeUuid))) return null;
        // Restored numeric IDs do not identify the original receipt owner.
        // Keep the native outbox intact until its financial import is approved.
        await this.assertBillingAllowed();
        if (!/^(0|[1-9][0-9]{0,18})$/.test(node.multiplier) || BigInt(node.multiplier) > maxInt64)
            throw new Error('Invalid usage multiplier');
        const capability = await this.axios.hostPolicy<{
            usageReceiptsSupported?: boolean;
            quotaInstanceId?: string | null;
            coreProcessId?: string | null;
            policyRevision?: string;
            applied?: boolean;
        }>(node.opts);
        if (
            !capability.isOk ||
            !capability.response.usageReceiptsSupported ||
            !capability.response.applied ||
            !capability.response.quotaInstanceId ||
            !capability.response.coreProcessId
        )
            throw new Error(
                'A live node must prove its usage receipt and quota journal capabilities',
            );
        const state = await this.transactions.withTransaction({ timeout: 30000 }, async () => {
            await this.assertBillingAllowed();
            await this.lock(node.nodeId);
            const modes = await sql<{
                instance: string | null;
                phase: string;
                initialCore: string | null;
                initialDrained: Date | null;
                fencedCore: string | null;
                fencedRevision: string | null;
            }>`SELECT instance_uuid AS instance,phase,initial_core AS "initialCore",initial_drained_at AS "initialDrained",
                fenced_core AS "fencedCore",fenced_revision::text AS "fencedRevision"
                FROM xera_quota_node_modes WHERE node_uuid=${node.nodeUuid}::uuid FOR UPDATE`.execute(
                this.db.kysely,
            );
            if (modes.rows[0]?.instance !== capability.response.quotaInstanceId)
                throw new Error('Quota node instance changed during usage preparation');
            await sql`INSERT INTO xera_node_usage_streams(stream_id,node_uuid,node_id)
                VALUES(${capability.response.quotaInstanceId}::uuid,${node.nodeUuid}::uuid,${node.nodeId}) ON CONFLICT(node_uuid) DO NOTHING`.execute(
                this.db.kysely,
            );
            const current = await this.stream(node.nodeUuid);
            if (
                !current ||
                current.stream !== capability.response.quotaInstanceId ||
                current.nodeId !== node.nodeId.toString()
            )
                throw new Error('Usage stream requires recovery after a node identity change');
            if (!current.core) {
                const mode = modes.rows[0];
                if (!mode.initialCore)
                    throw new Error('Initial core identity must be committed before quota cutover');
                if (mode.phase === 'FENCING' && !mode.initialDrained) {
                    if (mode.initialCore !== capability.response.coreProcessId)
                        throw new Error('Unconfirmed initial core debt requires recovery');
                    if (
                        mode.fencedCore !== capability.response.coreProcessId ||
                        mode.fencedRevision !== capability.response.policyRevision
                    )
                        throw new Error(
                            'Initial usage capture awaits the committed live quota fence',
                        );
                }
                await sql`UPDATE xera_node_usage_streams SET expected_core=${capability.response.coreProcessId}::uuid,
                    requested_at=clock_timestamp(),consumption_multiplier=${node.multiplier}::bigint,updated_at=now()
                    WHERE node_uuid=${node.nodeUuid}::uuid`.execute(this.db.kysely);
            }
            return (await this.stream(node.nodeUuid))!;
        });
        // This preparation commits before the remote counter reset. A lost
        // response retries the very same sequence and process identity.
        let frame: Extract<
            ReturnType<typeof parseUsageReceiptResponse>,
            { stats: unknown }
        > | null = null;
        let sampleError: unknown = null;
        if (!state.digest) {
            const request: UsageReceiptRequest = {
                action: 'sample',
                stream: state.stream,
                sequence: state.sequence,
                coreProcessId: state.core!,
            };
            try {
                const response = await this.axios.usageReceipt(node.opts, request);
                if (!response.isOk)
                    throw new Error('Usage sample response is unavailable; retry the same request');
                const sampled = parseUsageReceiptResponse(request, response.response);
                if (!('stats' in sampled)) throw new Error('Usage sample response was not a frame');
                frame = sampled;
            } catch (error) {
                // Another collector may have committed/ACKed this same request
                // while its replay was in flight. Inspect the durable ticket
                // before reporting an outage or applying any monetary change.
                sampleError = error;
            }
        }
        const committed = await this.transactions.withTransaction({ timeout: 30000 }, async () => {
            await this.lock(node.nodeId);
            const current = await this.stream(node.nodeUuid);
            if (
                !current ||
                current.stream !== state.stream ||
                current.sequence !== state.sequence ||
                current.core !== state.core
            )
                throw new Error('Usage request was superseded; retry collection');
            if (current.digest && frame && current.digest !== frame.digest)
                throw new Error('Usage replay differs from the committed receipt');
            if (!current.digest) {
                if (sampleError) throw sampleError;
                if (!frame)
                    throw new Error('Usage sample response is unavailable; retry the same request');
                // Policy acknowledgements also hold this row before changing
                // exposure barriers. Keep receipt coverage and the barrier in
                // one lock order, before any per-scope billing locks.
                await sql`SELECT 1 FROM xera_quota_node_modes WHERE node_uuid=${node.nodeUuid}::uuid FOR UPDATE`.execute(
                    this.db.kysely,
                );
                const pendingEffects = await this.applySnapshot(
                    node,
                    current,
                    frame.stats,
                    frame.capturedAt,
                );
                await sql`SELECT xera_cover_quota_usage_exposure(${node.nodeUuid}::uuid,${frame.coreProcessId}::uuid,
                    ${current.stream}::uuid,${current.sequence}::bigint,${current.requestedAt}::timestamptz)`.execute(
                    this.db.kysely,
                );
                await sql`UPDATE xera_quota_node_modes SET initial_drained_at=clock_timestamp(),initial_drain_sequence=${current.sequence}::bigint
                    WHERE node_uuid=${node.nodeUuid}::uuid AND instance_uuid=${current.stream}::uuid AND phase='FENCING'
                    AND initial_core=${frame.coreProcessId}::uuid AND fenced_core=${frame.coreProcessId}::uuid AND initial_drained_at IS NULL
                    AND (NOT user_quota OR (legacy_usage_drained_at IS NOT NULL
                        AND floor(extract(epoch FROM legacy_usage_drained_at)*1000)<${current.requestedAt!.getTime()}::bigint))
                    AND floor(extract(epoch FROM fenced_at)*1000)<${current.requestedAt!.getTime()}::bigint`.execute(
                    this.db.kysely,
                );
                await sql`UPDATE xera_node_usage_streams SET committed_digest=${frame.digest},pending_effects=${JSON.stringify(pendingEffects)}::jsonb,
                    last_core=expected_core,last_requested_at=requested_at,last_captured_at=to_timestamp(${frame.capturedAt}::numeric/1000),
                    last_committed_at=clock_timestamp(),last_committed_sequence=next_sequence,updated_at=now()
                    WHERE node_uuid=${node.nodeUuid}::uuid`.execute(this.db.kysely);
            }
            return (await this.stream(node.nodeUuid))!;
        });
        await this.assertBillingAllowed();
        if (committed.effects) {
            // Notifications and optional exports are retriable side effects;
            // they never increment billing counters. Their receipt is stable.
            await effects(`${committed.stream}-${committed.sequence}`, committed.effects);
            await this.transactions.withTransaction({ timeout: 30000 }, async () => {
                await this.assertBillingAllowed();
                await this.lock(node.nodeId);
                await sql`UPDATE xera_node_usage_streams SET pending_effects=NULL WHERE node_uuid=${node.nodeUuid}::uuid
                    AND stream_id=${committed.stream}::uuid AND next_sequence=${committed.sequence}::bigint AND committed_digest=${committed.digest}`.execute(
                    this.db.kysely,
                );
            });
        }
        const request: UsageReceiptRequest = {
            action: 'ack',
            stream: committed.stream,
            sequence: committed.sequence,
            coreProcessId: committed.core!,
            digest: committed.digest!,
        };
        await this.assertBillingAllowed();
        const acknowledgement = await this.axios.usageReceipt(node.opts, request);
        if (!acknowledgement.isOk)
            throw new Error('Usage acknowledgement is uncertain; retry the same acknowledgement');
        parseUsageReceiptResponse(request, acknowledgement.response);
        await this.transactions.withTransaction({ timeout: 30000 }, async () => {
            await this.assertBillingAllowed();
            await this.lock(node.nodeId);
            await sql`UPDATE xera_node_usage_streams SET next_sequence=next_sequence+1,expected_core=NULL,requested_at=NULL,
                consumption_multiplier=NULL,committed_digest=NULL,updated_at=now()
                WHERE node_uuid=${node.nodeUuid}::uuid AND stream_id=${committed.stream}::uuid
                AND next_sequence=${committed.sequence}::bigint AND committed_digest=${committed.digest} AND pending_effects IS NULL`.execute(
                this.db.kysely,
            );
        });
        return {
            requestedAt: committed.requestedAt!.getTime(),
            coreProcessId: committed.core!,
            sequence: committed.sequence,
        };
    }

    async applySnapshot(
        node: UsageNode,
        stream: Pick<Stream, 'requestedAt' | 'multiplier'> & Partial<Pick<Stream, 'stream'>>,
        stats: { name: string; value: string }[],
        capturedAt: string,
    ): Promise<UsageEffects> {
        if (!this.transactions.isTransactionActive())
            throw new Error('Usage billing must share the receipt transaction');
        // Also covers legacy outbox retries and a restore begun during RPC.
        await this.assertBillingAllowed();
        const owners = new Map<string, bigint>();
        const hosts = new Map<string, { owner: string; host: string; bytes: bigint }>();
        const outside: {
            account: string;
            owner: string;
            factor: string;
            scale: string;
            bytes: string;
        }[] = [];
        for (const stat of stats) {
            if (stat.name.startsWith(UNRESERVED_PREFIX)) {
                const counter = parseUnreservedUsageCounter(stat.name);
                if (!counter || !stream.stream)
                    throw new Error('Unreserved usage requires a native journal binding');
                outside.push({
                    account: counter.account,
                    owner: counter.owner,
                    factor: counter.factor.toString(),
                    scale: counter.scale.toString(),
                    bytes: stat.value,
                });
                // Native counter collection may split metadata and raw counters
                // across adjacent frames. Preserve presence without billing twice.
                if (!owners.has(counter.owner)) owners.set(counter.owner, 0n);
                continue;
            }
            const username = stat.name.slice(7, stat.name.lastIndexOf('>>>traffic>>>'));
            const owner = usageOwner(username);
            if (!owner || !/^[1-9][0-9]{0,18}$/.test(owner) || BigInt(owner) > maxInt64) continue;
            const bytes = BigInt(stat.value);
            const total = (owners.get(owner) ?? 0n) + bytes;
            if (total > maxInt64) throw new Error('Usage owner sum exceeds int64');
            owners.set(owner, total);
            const host = parseHostIdentity(username);
            if (host) {
                const key = `${owner}:${host.hostUuid}`;
                hosts.set(key, {
                    owner,
                    host: host.hostUuid,
                    bytes: (hosts.get(key)?.bytes ?? 0n) + bytes,
                });
            }
        }
        if (outside.length)
            await sql`SELECT 1 FROM xera_account_unreserved_usage(${node.nodeUuid}::uuid,${stream.stream!}::uuid,${JSON.stringify(outside)}::jsonb)`.execute(
                this.db.kysely,
            );
        const day = stream.requestedAt!.toISOString().slice(0, 10);
        const firstConnected: string[] = [];
        const sorted = [...owners].sort(([a], [b]) => (BigInt(a) < BigInt(b) ? -1 : 1));
        const ignore = this.config.getOrThrow('USER_USAGE_IGNORE_BELOW_BYTES');
        const history = !this.config.getOrThrow('SERVICE_DISABLE_USER_USAGE_RECORDS');
        for (let offset = 0; offset < sorted.length; offset += 500) {
            const batch = sorted.slice(offset, offset + 500);
            const values = batch.map(([owner, raw]) => {
                const billed = raw < ignore ? 0n : multiplyConsumption(stream.multiplier!, raw);
                if (billed > maxInt64) throw new Error('Billed usage exceeds int64');
                return sql`(${owner}::bigint,${raw.toString()}::bigint,${billed.toString()}::bigint)`;
            });
            const updated = await sql<{
                id: string;
            }>`WITH data(id,raw,billed) AS (VALUES ${sql.join(values)}),
                locked AS (SELECT u.id FROM user_traffic u JOIN data d ON d.id=u.id ORDER BY u.id FOR UPDATE OF u),
                changed AS (UPDATE user_traffic u SET used_traffic_bytes=u.used_traffic_bytes+d.billed,
                    lifetime_used_traffic_bytes=u.lifetime_used_traffic_bytes+d.billed,online_at=now(),
                    first_connected_at=COALESCE(u.first_connected_at,now()),
                    last_connected_node_uuid=(SELECT uuid FROM nodes WHERE uuid=${node.nodeUuid}::uuid)
                    FROM data d JOIN locked l ON l.id=d.id WHERE u.id=d.id
                    RETURNING u.id,(u.first_connected_at=u.online_at) AS first)
                SELECT id::text AS id FROM changed WHERE first`.execute(this.db.kysely);
            firstConnected.push(...updated.rows.map((row) => row.id));
            if (history)
                await sql`INSERT INTO nodes_user_usage_history(node_id,user_id,total_bytes,created_at,updated_at)
                SELECT ${node.nodeId},d.id,d.raw,${day}::date,now() FROM (VALUES ${sql.join(values)}) AS d(id,raw,billed)
                JOIN users u ON u.id=d.id JOIN nodes n ON n.id=${node.nodeId}
                ON CONFLICT(node_id,created_at,user_id) DO UPDATE SET total_bytes=nodes_user_usage_history.total_bytes+excluded.total_bytes,updated_at=now()`.execute(
                    this.db.kysely,
                );
        }
        const hostRecords = [...hosts.values()].sort((a, b) =>
            BigInt(a.owner) === BigInt(b.owner)
                ? a.host.localeCompare(b.host)
                : BigInt(a.owner) < BigInt(b.owner)
                  ? -1
                  : 1,
        );
        for (let offset = 0; offset < hostRecords.length; offset += 500) {
            const values = hostRecords
                .slice(offset, offset + 500)
                .map(
                    (row) =>
                        sql`(${row.owner}::bigint,${row.host}::uuid,${row.bytes.toString()}::bigint)`,
                );
            await sql`INSERT INTO xera_host_quota_usage(user_id,host_uuid,node_id,total_bytes,created_at)
                SELECT d.owner,d.host,${node.nodeId},d.bytes,${day}::date FROM (VALUES ${sql.join(values)}) AS d(owner,host,bytes)
                JOIN users u ON u.id=d.owner JOIN hosts h ON h.uuid=d.host
                ON CONFLICT(user_id,host_uuid,node_id,created_at) DO UPDATE SET total_bytes=xera_host_quota_usage.total_bytes+excluded.total_bytes`.execute(
                this.db.kysely,
            );
        }
        return {
            owners: sorted.map(([id, bytes]) => ({ id, bytes: bytes.toString() })),
            firstConnected,
            capturedAt,
        };
    }
}

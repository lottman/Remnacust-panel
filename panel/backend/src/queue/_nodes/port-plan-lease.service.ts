import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { InjectRedis } from '@songkeys/nestjs-redis';
import Redis, { Command as RedisCommand } from 'ioredis';
import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { TxKyselyService } from '@common/database';

import type { NodesEntity } from '@modules/nodes/entities/nodes.entity';

const DELIVERY_LEASE_MS = 120000;
const DELIVERY_RENEW_MS = 20000;
const DELIVERY_REDIS_TIMEOUT_MS = 5000;
const RENEW_DELIVERY =
    "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],ARGV[2]) end return 0";
const RELEASE_DELIVERY =
    "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0";
const SAVE_STOP = `local previous=redis.call('GET',KEYS[1]); if previous and cjson.decode(previous).isNeedToBeDeleted then return previous end; redis.call('SET',KEYS[1],ARGV[1]); return ARGV[1]`;
const CLEAR_STOP = `local previous=redis.call('GET',KEYS[1]); if previous and cjson.decode(previous).generation==ARGV[1] then return redis.call('DEL',KEYS[1]) end; return 0`;

export interface NodeStopRequest {
    nodeUuid: string;
    isNeedToBeDeleted: boolean;
    generation?: string;
}

export class NodeDeliveryBusyError extends Error {}
export class NodeDeliveryLostError extends Error {}
export class NodeDeliveryRetryableError extends Error {}
export function isRetryableNodeFailure(value: unknown): boolean {
    if (!value || typeof value !== 'object' || !('code' in value) || typeof value.code !== 'string')
        return false;
    return /^(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|ECONNABORTED|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|NODE_HTTP_5\d\d)$/.test(
        value.code,
    );
}
type NodeDeliveryState = Pick<
    NodesEntity,
    'uuid' | 'isDisabled' | 'activeConfigProfileUuid' | 'address' | 'port' | 'proxyUrl'
>;

export class PortPlanLeaseLostError extends Error {
    constructor() {
        super('Port-plan delivery ownership changed');
    }
}

@Injectable()
export class PortPlanLeaseService {
    private readonly logger = new Logger(PortPlanLeaseService.name);
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        @InjectRedis() private readonly redis: Redis,
    ) {}

    private redisCommand(name: string, ...args: (string | number)[]): Promise<unknown> {
        const command = new RedisCommand(name, args, {
            replyEncoding: 'utf8',
            keyPrefix: this.redis.options.keyPrefix,
        });
        command.setTimeout(DELIVERY_REDIS_TIMEOUT_MS);
        this.redis.sendCommand(command);
        return command.promise;
    }

    async withLifecycle<T>(
        nodeUuid: string,
        work: (assert: () => Promise<void>) => Promise<T>,
    ): Promise<T> {
        const key = `remnacust:node-delivery:${nodeUuid}`;
        const owner = randomUUID();
        if ((await this.redisCommand('set', key, owner, 'PX', DELIVERY_LEASE_MS, 'NX')) !== 'OK')
            throw new NodeDeliveryBusyError('Node delivery is already running');
        let lost = false;
        let renewal: Promise<void> | undefined;
        const assert = async () => {
            if (
                lost ||
                (await this.redisCommand(
                    'eval',
                    RENEW_DELIVERY,
                    1,
                    key,
                    owner,
                    DELIVERY_LEASE_MS,
                )) !== 1
            ) {
                lost = true;
                throw new NodeDeliveryLostError('Node delivery ownership changed');
            }
        };
        const timer = setInterval(() => {
            if (!renewal)
                renewal = assert()
                    .catch(() => {
                        lost = true;
                    })
                    .finally(() => {
                        renewal = undefined;
                    });
        }, DELIVERY_RENEW_MS);
        timer.unref();
        try {
            return await work(assert);
        } finally {
            clearInterval(timer);
            await renewal;
            await this.redisCommand('eval', RELEASE_DELIVERY, 1, key, owner).catch(() =>
                this.logger.warn(`Node ${nodeUuid}: delivery ownership will expire`),
            );
        }
    }

    async saveStopRequest(nodeUuid: string, isNeedToBeDeleted: boolean): Promise<NodeStopRequest> {
        const request: NodeStopRequest = { nodeUuid, isNeedToBeDeleted, generation: randomUUID() };
        const saved = await this.redisCommand(
            'eval',
            SAVE_STOP,
            1,
            `remnacust:node-stop:${nodeUuid}`,
            JSON.stringify(request),
        );
        if (typeof saved !== 'string') throw new Error('Invalid node stop generation');
        return JSON.parse(saved) as NodeStopRequest;
    }

    async currentStopRequest(request: NodeStopRequest): Promise<NodeStopRequest> {
        const saved = await this.redisCommand('get', `remnacust:node-stop:${request.nodeUuid}`);
        if (saved === null) return request;
        if (typeof saved !== 'string' || saved.length > 1024)
            throw new Error('Invalid node stop generation');
        const current = JSON.parse(saved) as NodeStopRequest;
        if (
            current.nodeUuid !== request.nodeUuid ||
            typeof current.generation !== 'string' ||
            typeof current.isNeedToBeDeleted !== 'boolean'
        )
            throw new Error('Invalid node stop generation');
        return current;
    }

    async isStopRequestCurrent(request: NodeStopRequest): Promise<boolean> {
        const saved = await this.redisCommand('get', `remnacust:node-stop:${request.nodeUuid}`);
        if (saved !== null && typeof saved !== 'string')
            throw new Error('Invalid node stop generation');
        return saved === null
            ? request.generation === undefined
            : JSON.parse(saved).generation === request.generation;
    }

    async clearStopRequest(request: NodeStopRequest): Promise<void> {
        if (request.generation)
            await this.redisCommand(
                'eval',
                CLEAR_STOP,
                1,
                `remnacust:node-stop:${request.nodeUuid}`,
                request.generation,
            );
    }

    async commitLifecycleStatus<T>(
        node: NodeDeliveryState,
        action: () => Promise<T>,
        request?: NodeStopRequest,
    ): Promise<T | undefined> {
        if (request && !(await this.isStopRequestCurrent(request))) return undefined;
        return this.transactions.withTransaction({ timeout: 10000 }, async () => {
            const current = await sql`SELECT uuid FROM nodes WHERE uuid=${node.uuid}::uuid
                AND is_disabled=${node.isDisabled}
                AND active_config_profile_uuid IS NOT DISTINCT FROM ${node.activeConfigProfileUuid}::uuid
                AND address=${node.address} AND port IS NOT DISTINCT FROM ${node.port}
                AND proxy_url IS NOT DISTINCT FROM ${node.proxyUrl} FOR UPDATE`.execute(
                this.db.kysely,
            );
            if (!current.rows.length) return undefined;
            return action();
        });
    }

    async acquire(nodeUuid: string): Promise<PortPlanLease | 'busy' | null> {
        const owner = randomUUID();
        const result = await sql<{ revision: string; epoch: string }>`
            UPDATE xera_node_port_plans p SET delivery_owner=${owner}::uuid,
              delivery_until=clock_timestamp()+interval '120 seconds',delivery_epoch=delivery_epoch+1
            FROM nodes n WHERE p.node_uuid=${nodeUuid}::uuid AND n.uuid=p.node_uuid AND NOT n.is_disabled
              AND (delivery_until IS NULL OR delivery_until<=clock_timestamp())
              AND delivery_epoch<9223372036854775807
            RETURNING p.revision::text,p.delivery_epoch::text AS epoch`.execute(this.db.kysely);
        if (result.rows[0])
            return new PortPlanLease(
                this,
                nodeUuid,
                owner,
                result.rows[0].epoch,
                result.rows[0].revision,
            );
        const exists =
            await sql`SELECT node_uuid FROM xera_node_port_plans WHERE node_uuid=${nodeUuid}::uuid`.execute(
                this.db.kysely,
            );
        return exists.rows.length ? 'busy' : null;
    }

    async renew(lease: PortPlanLease, minimumEpoch?: string): Promise<string> {
        if (
            minimumEpoch !== undefined &&
            (!/^(0|[1-9][0-9]{0,18})$/.test(minimumEpoch) ||
                BigInt(minimumEpoch) >= 9223372036854775807n)
        )
            throw new PortPlanLeaseLostError();
        const result = await sql<{ epoch: string }>`UPDATE xera_node_port_plans p
            SET delivery_until=clock_timestamp()+interval '120 seconds',
                delivery_epoch=GREATEST(delivery_epoch,${minimumEpoch ?? '0'}::bigint+CASE WHEN ${minimumEpoch !== undefined} THEN 1 ELSE 0 END)
            WHERE node_uuid=${lease.nodeUuid}::uuid AND delivery_owner=${lease.owner}::uuid AND delivery_until>clock_timestamp()
              AND EXISTS(SELECT 1 FROM nodes n WHERE n.uuid=p.node_uuid AND NOT n.is_disabled)
            RETURNING delivery_epoch::text AS epoch`.execute(this.db.kysely);
        if (!result.rows[0]) throw new PortPlanLeaseLostError();
        return result.rows[0].epoch;
    }

    async commit<T>(
        lease: PortPlanLease,
        action: () => Promise<T>,
        node?: NodeDeliveryState,
    ): Promise<T> {
        if (this.transactions.isTransactionActive())
            throw new Error('Delivery result requires its own commit boundary');
        return this.transactions.withTransaction({ timeout: 10000 }, async () => {
            // Match the editor's node -> header lock order. Never hold a SQL
            // transaction across network I/O, validation or config preparation.
            const current = await sql`SELECT uuid FROM nodes WHERE uuid=${lease.nodeUuid}::uuid
                ${
                    node
                        ? sql`AND is_disabled=${node.isDisabled} AND active_config_profile_uuid IS NOT DISTINCT FROM ${node.activeConfigProfileUuid}::uuid
                    AND address=${node.address} AND port IS NOT DISTINCT FROM ${node.port} AND proxy_url IS NOT DISTINCT FROM ${node.proxyUrl}`
                        : sql``
                }
                FOR UPDATE`.execute(this.db.kysely);
            if (node && !current.rows.length) throw new PortPlanLeaseLostError();
            const owned =
                await sql`SELECT p.node_uuid FROM xera_node_port_plans p JOIN nodes n ON n.uuid=p.node_uuid
                WHERE p.node_uuid=${lease.nodeUuid}::uuid AND p.delivery_owner=${lease.owner}::uuid
                AND p.delivery_until>clock_timestamp() AND NOT n.is_disabled FOR UPDATE OF p`.execute(
                    this.db.kysely,
                );
            if (!owned.rows.length) throw new PortPlanLeaseLostError();
            return action();
        });
    }

    async release(lease: PortPlanLease): Promise<void> {
        await this.transactions.withTransaction({ timeout: 10000 }, async () => {
            await sql`SELECT uuid FROM nodes WHERE uuid=${lease.nodeUuid}::uuid FOR UPDATE`.execute(
                this.db.kysely,
            );
            const released =
                await sql`UPDATE xera_node_port_plans SET delivery_owner=NULL,delivery_until=NULL
                WHERE node_uuid=${lease.nodeUuid}::uuid AND delivery_owner=${lease.owner}::uuid RETURNING node_uuid`.execute(
                    this.db.kysely,
                );
            if (released.rows.length)
                await sql`UPDATE nodes SET is_connecting=false WHERE uuid=${lease.nodeUuid}::uuid`.execute(
                    this.db.kysely,
                );
        });
    }
}

export class PortPlanLease {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private renewal: Promise<void> | null = null;
    private lost = false;
    private closed = false;
    constructor(
        private readonly service: PortPlanLeaseService,
        readonly nodeUuid: string,
        readonly owner: string,
        public epoch: string,
        readonly revision: string,
    ) {
        this.schedule();
    }
    get delivery() {
        return { epoch: this.epoch, owner: this.owner };
    }
    private schedule() {
        if (this.closed || this.lost) return;
        this.timer = setTimeout(() => {
            this.renewal = this.assert()
                .catch(() => {
                    this.lost = true;
                })
                .finally(() => {
                    this.renewal = null;
                    this.schedule();
                });
        }, 20000);
        this.timer.unref();
    }
    async assert(minimumEpoch?: string): Promise<void> {
        if (this.lost || this.closed) throw new PortPlanLeaseLostError();
        try {
            const epoch = await this.service.renew(this, minimumEpoch);
            if (BigInt(epoch) > BigInt(this.epoch)) this.epoch = epoch;
        } catch (error) {
            this.lost = true;
            throw error;
        }
    }
    async commit<T>(action: () => Promise<T>, node?: NodeDeliveryState): Promise<T> {
        if (this.lost || this.closed) throw new PortPlanLeaseLostError();
        return this.service.commit(this, action, node);
    }
    async close(): Promise<void> {
        this.closed = true;
        if (this.timer) clearTimeout(this.timer);
        await this.renewal;
        await this.service.release(this);
    }
}

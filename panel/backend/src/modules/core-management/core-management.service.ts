import { InjectRedis } from '@songkeys/nestjs-redis';
import { Job, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { setTimeout as delay } from 'node:timers/promises';

import { InjectQueue } from '@nestjs/bullmq';
import {
    BadRequestException,
    Injectable,
    NotFoundException,
    OnModuleInit,
    ServiceUnavailableException,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { AxiosService } from '@common/axios/axios.service';
import { coreSshTunnelKey } from '@common/utils/core-ssh-tunnel';

import { GetNodeByUuidQuery } from '@modules/nodes/queries/get-node-by-uuid';

import {
    CORE_QUEUE,
    coreCatalog,
    CoreJobData,
    CoreJobRequest,
    CoreOperation,
    CoreResult,
    CoreStatus,
} from './core-management.types';

@Injectable()
export class CoreManagementService implements OnModuleInit {
    constructor(
        @InjectQueue(CORE_QUEUE) private readonly queue: Queue<CoreJobData>,
        private readonly queries: QueryBus,
        private readonly axios: AxiosService,
        @InjectRedis() private readonly redis: Redis,
    ) {}
    async onModuleInit() {
        coreCatalog();
        await this.queue.setGlobalConcurrency(1);
    }
    catalog() {
        return coreCatalog().map((release) => ({
            id: release.id,
            build: release.build,
            architectures: Object.keys(release.artifacts),
        }));
    }
    private async statusWithRetry(
        uuid: string,
        attempts = 3,
        retryDelayMs = 3000,
    ): Promise<CoreStatus> {
        let lastError: unknown;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            try {
                return await this.statusOnce(uuid);
            } catch (error) {
                lastError = error;
                if (attempt + 1 < attempts) await delay(retryDelayMs);
            }
        }
        throw lastError instanceof Error ? lastError : new Error('Node status unavailable');
    }

    private async node(uuid: string) {
        const node = await this.queries.execute(new GetNodeByUuidQuery(uuid));
        if (!node.isOk) throw new NotFoundException('Node not found');
        return node.response;
    }
    private async managedCore<T>(
        node: Parameters<AxiosService['managedCore']>[0] & { uuid: string },
        data?: unknown,
    ) {
        const proxyUrl = await this.redis.get(coreSshTunnelKey(node.uuid));
        if (proxyUrl?.startsWith('socks5h://127.0.0.1:')) {
            const tunneled = await this.axios.managedCore<T>({ ...node, proxyUrl }, data);
            if (tunneled.isOk || !/Node connection failed/i.test(tunneled.message ?? ''))
                return tunneled;
        }
        return this.axios.managedCore<T>(node, data);
    }
    async status(uuid: string): Promise<CoreStatus> {
        return this.statusWithRetry(uuid, 2, 300);
    }

    private async statusOnce(uuid: string): Promise<CoreStatus> {
        const node = await this.node(uuid);
        const result = await this.managedCore<CoreStatus>(node);
        if (!result.isOk) {
            const detail = result.message ?? 'no diagnostic was returned';
            const guidance = /HTTP 404\b/.test(detail)
                ? 'The node does not expose core-manager v1; update it to a compatible XERA node image.'
                : /HTTP (401|403)\b/.test(detail)
                  ? 'The node rejected panel authentication; check the node registration and panel-node certificates.'
                  : `Could not contact node core manager: ${detail}`;
            throw new ServiceUnavailableException(guidance);
        }
        if (result.response?.capabilityVersion !== 1)
            throw new ServiceUnavailableException(
                'The node responded, but does not support core manager v1. Update it with the current Remnacust node image.',
            );
        return {
            ...result.response,
            sshTunnelAvailable: Boolean(await this.redis.get(coreSshTunnelKey(uuid))),
        };
    }
    private assertSameRequest(prior: Job<CoreJobData>, input: CoreJobRequest) {
        if (
            prior.data.action !== input.action ||
            prior.data.releaseId !== input.releaseId ||
            prior.data.stopOnFailure !== input.stopOnFailure ||
            prior.data.nodeUuids.join() !== input.nodeUuids.join()
        )
            throw new BadRequestException('Request ID already used for a different operation');
    }
    async create(input: CoreJobRequest) {
        const prior = await this.queue.getJob(input.requestId);
        if (prior) {
            this.assertSameRequest(prior, input);
            return this.serialize(prior);
        }
        if (
            input.action === 'install' &&
            !coreCatalog().some((release) => release.id === input.releaseId)
        )
            throw new BadRequestException('Release is not in the approved catalog');
        const nodes = [];
        for (const uuid of input.nodeUuids) {
            const node = await this.node(uuid);
            nodes.push({ uuid, name: node.name });
        }
        const job = await this.queue.add(
            'core-operation',
            { ...input, nodes },
            {
                jobId: input.requestId,
                attempts: 1,
                removeOnComplete: { age: 30 * 86400, count: 500 },
                removeOnFail: { age: 30 * 86400, count: 500 },
            },
        );
        // BullMQ deduplicates concurrent inserts by jobId. Read the winner before replying.
        const persisted = (await this.queue.getJob(input.requestId)) ?? job;
        this.assertSameRequest(persisted, input);
        return this.serialize(persisted);
    }
    async list() {
        return Promise.all(
            (
                await this.queue.getJobs(
                    ['active', 'waiting', 'completed', 'failed', 'delayed'],
                    0,
                    49,
                )
            ).map((job) => this.serialize(job)),
        );
    }
    async detail(id: string) {
        return this.serialize(await this.find(id));
    }
    private async find(id: string) {
        const job = await this.queue.getJob(id);
        if (!job) throw new NotFoundException('Job not found');
        return job;
    }
    private cancelKey(id: string) {
        return this.queue.toKey(`cancel-${id}`);
    }
    async cancel(id: string) {
        const job = await this.find(id);
        if (['completed', 'failed'].includes(await job.getState())) return this.serialize(job);
        await this.redis.set(this.cancelKey(id), '1', 'EX', 31 * 86400);
        return this.serialize(job);
    }
    private async serialize(job: Job<CoreJobData>) {
        return {
            id: job.id,
            action: job.data.action,
            releaseId: job.data.releaseId,
            nodes: job.data.nodes,
            createdAt: job.timestamp,
            finishedAt: job.finishedOn,
            state: await job.getState(),
            cancelRequested: !!(await this.redis.get(this.cancelKey(job.id!))),
            results: Array.isArray(job.progress)
                ? job.progress
                : job.data.nodes.map((node) => ({ ...node, status: 'pending' })),
            error: job.failedReason
                ? 'Worker interrupted. Inspect node status before retrying.'
                : null,
        };
    }
    async process(job: Job<CoreJobData>) {
        const results: CoreResult[] = Array.isArray(job.progress)
            ? (job.progress as CoreResult[])
            : job.data.nodes.map((node) => ({ ...node, status: 'pending' }));
        let halted =
            results.some((result) => ['failed', 'rolled-back'].includes(result.status)) &&
            job.data.stopOnFailure;
        for (const [index, result] of results.entries()) {
            if (!['pending', 'running'].includes(result.status)) continue;
            if (result.status === 'pending' && (await this.redis.get(this.cancelKey(job.id!))))
                result.status = 'cancelled';
            else if (result.status === 'pending' && halted) result.status = 'skipped';
            else {
                result.status = 'running';
                result.phase = 'connecting';
                await job.updateProgress(results);
                try {
                    const node = await this.node(result.uuid);
                    if (node.isDisabled && !['check', 'stop'].includes(job.data.action))
                        throw new Error('Node was disabled; enable it before retrying');
                    const status = await this.statusWithRetry(result.uuid);
                    const operationId = `${job.id!.slice(0, 24)}${index.toString(16).padStart(12, '0')}`;
                    let operation = [status.operation, ...status.history].find(
                        (op) => op?.id === operationId,
                    );
                    if (!operation) {
                        if (status.operation?.status === 'running') {
                            for (let wait = 0; wait < 30; wait += 1) {
                                await delay(10_000);
                                const fresh = await this.statusWithRetry(result.uuid);
                                if (fresh.operation?.status !== 'running') break;
                            }
                            const settled = await this.statusWithRetry(result.uuid);
                            if (settled.operation?.status === 'running')
                                throw new Error('Another operation is already running on the node');
                        }
                        const release = coreCatalog().find(
                            (item) => item.id === job.data.releaseId,
                        );
                        const artifact = release?.artifacts[status.arch as 'amd64' | 'arm64'];
                        if (
                            job.data.action === 'install' &&
                            (!artifact || status.platform !== 'linux')
                        )
                            throw new Error('No approved release for this node architecture');
                        const sent = await this.managedCore<CoreOperation>(node, {
                            id: operationId,
                            action: job.data.action,
                            ...(job.data.action === 'install'
                                ? {
                                      release: {
                                          ...artifact,
                                          arch: status.arch,
                                          build: release!.build,
                                      },
                                  }
                                : {}),
                        });
                        operation = sent.isOk
                            ? sent.response
                            : (await this.statusWithRetry(result.uuid)).operation;
                        if (!operation) {
                            const retried = await this.statusWithRetry(result.uuid);
                            operation = [retried.operation, ...retried.history].find(
                                (op) => op?.id === operationId,
                            );
                        }
                        if (!operation || operation.id !== operationId)
                            throw new Error(
                                'Node did not accept the operation. Check its connectivity and status.',
                            );
                    }
                    const deadline =
                        Date.now() + (job.data.action === 'install' ? 30 : 10) * 60_000;
                    while (operation.status === 'running') {
                        result.phase = operation.phase;
                        await job.updateProgress(results);
                        if (Date.now() > deadline)
                            throw new Error('Operation timed out; check the node before retrying');
                        await delay(2000);
                        const fresh = await this.statusWithRetry(result.uuid);
                        const current = [fresh.operation, ...fresh.history].find(
                            (op) => op?.id === operationId,
                        );
                        if (!current)
                            throw new Error('Operation journal not found; check node storage');
                        operation = current;
                    }
                    result.status = operation.status;
                    result.phase = operation.phase;
                    result.error = operation.error;
                } catch (error) {
                    result.status = 'failed';
                    result.error =
                        error instanceof Error
                            ? error.message.slice(0, 500)
                            : 'Core operation failed';
                }
                if (result.status !== 'succeeded' && job.data.stopOnFailure) halted = true;
            }
            await job.updateProgress(results);
        }
        return results;
    }
}

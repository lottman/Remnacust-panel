import { Job } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';

import { AxiosService } from '@common/axios';
import { ERRORS } from '@libs/contracts/constants';

import { DeleteNodeByUuidCommand } from '@modules/nodes/commands/delete-node-by-uuid';
import { UpdateNodeCommand } from '@modules/nodes/commands/update-node';
import { GetNodeByUuidQuery } from '@modules/nodes/queries/get-node-by-uuid';

import { QUEUES_NAMES } from '@queue/queue.enum';

import { NodeStopRequest, PortPlanLeaseService } from '../port-plan-lease.service';

@Processor(QUEUES_NAMES.NODES.STOP, { concurrency: 30 })
export class StopNodeProcessor extends WorkerHost {
    private readonly logger = new Logger(StopNodeProcessor.name);

    constructor(
        private readonly axios: AxiosService,
        private readonly queryBus: QueryBus,
        private readonly commandBus: CommandBus,
        private readonly deliveries: PortPlanLeaseService,
    ) {
        super();
    }

    async process(job: Job<NodeStopRequest>): Promise<boolean> {
        let request = job.data;
        try {
            return await this.deliveries.withLifecycle(request.nodeUuid, async (assert) => {
                request = await this.deliveries.currentStopRequest(request);
                const result = await this.queryBus.execute(
                    new GetNodeByUuidQuery(request.nodeUuid),
                );
                if (!result.isOk) {
                    if (result.code !== ERRORS.NODE_NOT_FOUND.code)
                        throw new Error('Node lookup failed; stop was not confirmed');
                    await this.deliveries.clearStopRequest(request);
                    return true;
                }
                const node = result.response;
                if (request.isNeedToBeDeleted) {
                    await assert();
                    await this.commandBus.execute(new DeleteNodeByUuidCommand(node.uuid));
                    const remaining = await this.queryBus.execute(
                        new GetNodeByUuidQuery(node.uuid),
                    );
                    if (remaining.isOk || remaining.code !== ERRORS.NODE_NOT_FOUND.code)
                        throw new Error('Node deletion was not committed');
                    await this.deliveries.clearStopRequest(request);
                    return true;
                }
                if (
                    !node.isDisabled &&
                    node.activeConfigProfileUuid &&
                    node.activeInbounds.length
                ) {
                    await this.deliveries.clearStopRequest(request);
                    return true;
                }
                await assert();
                const stopped = await this.axios.stopXray({
                    address: node.address,
                    port: node.port,
                    proxyUrl: node.proxyUrl,
                });
                if (!stopped.isOk || stopped.response.isStopped !== true)
                    throw new Error(
                        stopped.isOk
                            ? 'Node did not acknowledge stopping Xray'
                            : (stopped.message ?? 'Node stop request failed'),
                    );
                await assert();
                await this.deliveries.commitLifecycleStatus(
                    node,
                    async () => {
                        const updated = await this.commandBus.execute(
                            new UpdateNodeCommand({
                                uuid: node.uuid,
                                lastStatusMessage: null,
                                lastStatusChange: new Date(),
                                isConnected: false,
                                isConnecting: false,
                            }),
                        );
                        if (!updated.isOk) throw new Error('Node stop status was not committed');
                        return true;
                    },
                    request,
                );
                await this.deliveries.clearStopRequest(request);
                return true;
            });
        } catch (error) {
            const terminal = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
            const detail =
                error instanceof Error ? error.message.slice(0, 900) : 'Node stop failed';
            const message = `[NODE_STOP_${terminal ? 'FAILED' : 'PENDING'}] ${detail}`;
            try {
                const current = await this.queryBus.execute(
                    new GetNodeByUuidQuery(request.nodeUuid),
                );
                if (current.isOk)
                    await this.deliveries.commitLifecycleStatus(
                        current.response,
                        async () => {
                            const updated = await this.commandBus.execute(
                                new UpdateNodeCommand({
                                    uuid: request.nodeUuid,
                                    lastStatusMessage: message,
                                }),
                            );
                            if (!updated.isOk)
                                throw new Error('Node stop diagnostic was not committed');
                            return true;
                        },
                        request,
                    );
                if (terminal) await this.deliveries.clearStopRequest(request);
            } catch {
                this.logger.error(
                    `Node ${request.nodeUuid}: stop diagnostic could not be committed`,
                );
            }
            this.logger.error(`Node ${request.nodeUuid}: ${message}`);
            throw error;
        }
    }
}

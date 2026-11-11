import { Job } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';

import { AxiosService } from '@common/axios';

import { QUEUES_NAMES } from '@queue/queue.enum';

import { NODES_JOB_NAMES } from '../constants/nodes-job-name.constant';
import { IAddUserToNodePayload, IRemoveUserFromNodePayload } from '../interfaces';
import { UserAccessDeliveryService } from '../user-access-delivery.service';

@Processor(QUEUES_NAMES.NODES.USERS, {
    concurrency: 75,
})
export class NodeUsersQueueProcessor extends WorkerHost {
    private readonly logger = new Logger(NodeUsersQueueProcessor.name);

    constructor(
        private readonly axios: AxiosService,
        private readonly delivery: UserAccessDeliveryService,
    ) {
        super();
    }

    async process(job: Job) {
        switch (job.name) {
            case NODES_JOB_NAMES.ADD_USER_TO_NODE:
                return await this.handleAddUserToNode(job);
            case NODES_JOB_NAMES.REMOVE_USER_FROM_NODE:
                return await this.handleRemoveUserFromNode(job);
            default:
                this.logger.warn(`Job "${job.name}" is not handled.`);
                break;
        }
    }

    private async handleAddUserToNode(job: Job<IAddUserToNodePayload>) {
        const { data, node } = job.data;
        const username = data.data[0]?.username;
        if (!username || data.data.some((item) => item.username !== username))
            throw new Error('Invalid user delivery identity');
        return this.delivery.deliver(
            node,
            [
                {
                    username,
                    hashUuid: data.hashData.vlessUuid,
                    tags: data.data.map((item) => item.tag),
                },
            ],
            true,
            () => this.axios.addUser(data, node),
            (job.attemptsMade ?? 0) + 1 >= (job.opts?.attempts ?? 1),
        );
    }

    private async handleRemoveUserFromNode(job: Job<IRemoveUserFromNodePayload>) {
        const { data, node } = job.data;
        return this.delivery.deliver(
            node,
            [{ username: data.username, hashUuid: data.hashData.vlessUuid }],
            false,
            () => this.axios.deleteUser(data, node),
            (job.attemptsMade ?? 0) + 1 >= (job.opts?.attempts ?? 1),
        );
    }
}

import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Cron } from '@nestjs/schedule';

import { GetOnlineNodesQuery } from '@modules/nodes/queries/get-online-nodes/get-online-nodes.query';

import { NodesQueuesService } from '@queue/_nodes';

import { JOBS_INTERVALS } from '../../intervals';

@Injectable()
export class RecordNodesUsageTask {
    private static readonly CRON_NAME = 'recordNodesUsage';
    private readonly logger = new Logger(RecordNodesUsageTask.name);

    constructor(
        private readonly queryBus: QueryBus,

        private readonly nodesQueuesService: NodesQueuesService,
    ) {}

    @Cron(JOBS_INTERVALS.RECORD_NODE_USAGE, {
        name: RecordNodesUsageTask.CRON_NAME,
        waitForCompletion: true,
    })
    async handleCron() {
        try {
            const nodesResponse = await this.queryBus.execute(new GetOnlineNodesQuery());
            if (!nodesResponse.isOk) {
                return;
            }

            if (nodesResponse.response.length === 0) {
                return;
            }

            await this.nodesQueuesService.recordNodeUsageBulk(
                nodesResponse.response.map((node) => ({
                    nodeUuid: node.uuid,
                    nodeConsumptionMultiplier: node.nodeConsumptionMultiplier.toString(),
                    connectionOpts: node.connectionOpts,
                })),
            );

            return;
        } catch (error) {
            this.logger.error(error);
        }
    }
}

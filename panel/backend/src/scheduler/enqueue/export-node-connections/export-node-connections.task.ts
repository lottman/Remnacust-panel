import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';

import { TypedConfigService } from '@common/config/app-config';

import { GetOnlineNodesQuery } from '@modules/nodes/queries/get-online-nodes';

import { NodesQueuesService } from '@queue/_nodes';

import { JOBS_INTERVALS } from '../../intervals';

@Injectable()
export class ExportNodeConnectionsTask implements OnApplicationBootstrap {
    private static readonly CRON_NAME = 'exportNodeConnections';
    private readonly logger = new Logger(ExportNodeConnectionsTask.name);

    constructor(
        private readonly queryBus: QueryBus,
        private readonly nodesQueuesService: NodesQueuesService,
        private readonly configService: TypedConfigService,
        private readonly schedulerRegistry: SchedulerRegistry,
    ) {}

    public async onApplicationBootstrap() {
        const isExportEnabled = this.configService.getOrThrow('EXPORT_TO_STREAM_ENABLED');

        if (isExportEnabled) {
            const job = this.schedulerRegistry.getCronJob(ExportNodeConnectionsTask.CRON_NAME);

            if (job) {
                job.start();
                this.logger.log('Export node connections job enabled.');
            } else {
                this.logger.warn('Export node connections job not found.');
            }
        } else {
            try {
                this.schedulerRegistry.deleteCronJob(ExportNodeConnectionsTask.CRON_NAME);

                this.logger.log('Export node connections job disabled.');
            } catch (error) {
                this.logger.error(
                    `Error deleting "${ExportNodeConnectionsTask.CRON_NAME}" cron job: ${error}`,
                );
            }
        }
    }

    @Cron(JOBS_INTERVALS.EXPORT_NODE_CONNECTIONS, {
        name: ExportNodeConnectionsTask.CRON_NAME,
        waitForCompletion: true,
        disabled: true,
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

            await this.nodesQueuesService.exportNodeConnectionsBulk(
                nodesResponse.response.map((node) => ({
                    nodeUuid: node.uuid,
                })),
            );

            return;
        } catch (error) {
            this.logger.error(`Error in ExportNodeConnectionsTask: ${error}`);
        }
    }
}

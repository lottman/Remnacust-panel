import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { NodeHealthLogService } from '@modules/nodes/node-health-log.service';

@Injectable()
export class NodeHealthLogCleanupTask implements OnApplicationBootstrap {
    private readonly logger = new Logger(NodeHealthLogCleanupTask.name);

    constructor(private readonly healthLog: NodeHealthLogService) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.handleCron();
    }

    @Cron('0 */10 * * * *', { name: 'nodeHealthLogCleanup', waitForCompletion: true })
    async handleCron() {
        try {
            await this.healthLog.cleanup();
        } catch (error) {
            this.logger.error(`Node health log cleanup failed: ${error}`);
        }
    }
}

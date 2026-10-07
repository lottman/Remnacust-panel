import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { NodeHealthLogService } from '@modules/nodes/node-health-log.service';

@Injectable()
export class NodeHealthLogCleanupTask {
    private readonly logger = new Logger(NodeHealthLogCleanupTask.name);

    constructor(private readonly healthLog: NodeHealthLogService) {}

    @Cron('15 0 * * *', { name: 'nodeHealthLogCleanup', waitForCompletion: true })
    async handleCron() {
        try {
            await this.healthLog.cleanup();
        } catch (error) {
            this.logger.error(`Node health log cleanup failed: ${error}`);
        }
    }
}

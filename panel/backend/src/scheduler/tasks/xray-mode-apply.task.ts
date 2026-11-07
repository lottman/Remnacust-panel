import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { XrayModeService } from '@common/xray-mode/xray-mode.service';
import { NodesQueuesService } from '@queue/_nodes';

@Injectable()
export class XrayModeApplyTask {
    private readonly logger = new Logger(XrayModeApplyTask.name);

    constructor(private readonly modes: XrayModeService, private readonly nodes: NodesQueuesService) {}

    @Cron('*/10 * * * * *', { name: 'xrayModeApply', waitForCompletion: true })
    async run(): Promise<void> {
        try {
            const revision = await this.modes.pendingApply();
            if (revision === undefined) return;
            await this.nodes.startAllNodesWithoutDeduplication({ emitter: `xray-mode:${revision}` });
            await this.modes.markQueued(revision);
        } catch {
            this.logger.warn('Xray settings delivery will retry');
        }
    }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { BackupsService } from '@modules/backups/backups.service';

import { JOBS_INTERVALS } from '@scheduler/intervals';

@Injectable()
export class BackupsScheduledTask {
    private static readonly CRON_NAME = 'backupsScheduled';
    private readonly logger = new Logger(BackupsScheduledTask.name);

    constructor(private readonly backupsService: BackupsService) {}

    @Cron(JOBS_INTERVALS.BACKUPS_CHECK, {
        name: BackupsScheduledTask.CRON_NAME,
        waitForCompletion: true,
    })
    async handleCron() {
        try {
            await this.backupsService.cleanup();
            const settings = await this.backupsService.getSettings();
            if (!settings.isOk || settings.response.autoMode === 'OFF') return;
            if (!(await this.backupsService.encryptionStatus()).configured) return;

            const intervalMs = settings.response.intervalHours * 3_600_000;
            const list = await this.backupsService.list();
            if (!list.isOk) return;

            const newest = list.response.find(
                (item) => item.filename.startsWith('remnawave-scheduled-') && item.filename.endsWith('.zip'),
            );
            if (newest && Date.now() - newest.createdAt.getTime() < intervalMs) return;

            this.logger.log(`Creating scheduled ${settings.response.autoMode} backup`);
            await this.backupsService.create(true);
        } catch (error) {
            this.logger.error(error);
        }
    }
}

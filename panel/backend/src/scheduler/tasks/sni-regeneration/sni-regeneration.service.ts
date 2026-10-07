import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { HostsService } from '@modules/hosts/hosts.service';
import { HostsRepository } from '@modules/hosts/repositories/hosts.repository';

import { THostSniRegeneration } from '@libs/contracts/models';

import { JOBS_INTERVALS } from '@scheduler/intervals';

@Injectable()
export class SniRegenerationTask {
    private static readonly CRON_NAME = 'sniRegeneration';
    private readonly logger = new Logger(SniRegenerationTask.name);

    constructor(
        private readonly hostsRepository: HostsRepository,
        private readonly hostsService: HostsService,
    ) {}

    @Cron(JOBS_INTERVALS.SNI_REGENERATION, {
        name: SniRegenerationTask.CRON_NAME,
        waitForCompletion: true,
    })
    async handleCron() {
        try {
            const hosts = await this.hostsRepository.findAll();
            const now = Date.now();

            for (const host of hosts) {
                const settings = host.sniRegeneration as THostSniRegeneration | null;
                if (!settings?.enabled || !settings.pool?.length) continue;

                const lastRotated = settings.lastRotatedAt ? Date.parse(settings.lastRotatedAt) : 0;
                if (Number.isNaN(lastRotated)) continue;

                if (now - lastRotated < settings.intervalHours * 3_600_000) continue;

                try {
                    await this.hostsService.rotateHostSni(host, settings);
                    this.logger.log(`Rotated SNI for host ${host.uuid}`);
                } catch (error) {
                    this.logger.error(`SNI rotation failed for host ${host.uuid}: ${error}`);
                }
            }
        } catch (error) {
            this.logger.error(error);
        }
    }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { GeofilesService } from '@modules/subscription-template/geofiles/geofiles.service';

@Injectable()
export class GeofilesRefreshTask {
    private readonly logger = new Logger(GeofilesRefreshTask.name);
    constructor(private readonly files: GeofilesService) {}

    @Cron('0 * * * * *', { name: 'geofilesRefresh', waitForCompletion: true })
    async run() {
        try {
            await this.files.refreshDue();
        } catch {
            this.logger.error('geofile-refresh-failed');
        }
    }
}

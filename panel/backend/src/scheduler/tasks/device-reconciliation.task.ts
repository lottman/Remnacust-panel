import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { DeviceAccessService } from '@modules/hwid-user-devices/device-access.service';

@Injectable()
export class DeviceReconciliationTask {
    constructor(private readonly devices: DeviceAccessService) {}

    @Cron('*/10 * * * * *', { name: 'deviceReconciliation', waitForCompletion: true })
    async run(): Promise<void> {
        await this.devices.reconcilePendingDevices();
    }
}

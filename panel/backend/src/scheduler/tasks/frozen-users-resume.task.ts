import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Cron } from '@nestjs/schedule';

import { DeviceAccessService } from '@modules/hwid-user-devices/device-access.service';
import { ResumeFrozenUsersCommand } from '@modules/users/commands/resume-frozen-users/resume-frozen-users.command';

@Injectable()
export class FrozenUsersResumeTask {
    constructor(
        private readonly commands: CommandBus,
        private readonly access: DeviceAccessService,
    ) {}

    @Cron('*/5 * * * * *', { name: 'frozenUsersResume', waitForCompletion: true })
    async run(): Promise<void> {
        if (await this.commands.execute(new ResumeFrozenUsersCommand()))
            this.access.kickReconciliation();
    }
}

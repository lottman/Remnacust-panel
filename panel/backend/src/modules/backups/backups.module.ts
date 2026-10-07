import { BackupAccessService, BackupAccessGuard } from './backup-access.service';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';

@Module({
    imports: [CqrsModule],
    controllers: [BackupsController],
    providers: [BackupsService, BackupAccessService, BackupAccessGuard],
    exports: [BackupsService],
})
export class BackupsModule {}

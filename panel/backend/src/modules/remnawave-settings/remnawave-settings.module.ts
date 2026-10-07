import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { QUERIES } from './queries';
import { RemnawaveSettingsController } from './remnawave-settings.controller';
import { RemnawaveSettingsService } from './remnawave-settings.service';
import { RemnawaveSettingsRepository } from './repositories/remnawave-settings.repository';

@Module({
    imports: [CqrsModule],
    controllers: [RemnawaveSettingsController],
    providers: [RemnawaveSettingsService, RemnawaveSettingsRepository, ...QUERIES],
})
export class RemnawaveSettingsModule {}

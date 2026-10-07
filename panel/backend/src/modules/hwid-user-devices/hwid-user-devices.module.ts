import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { COMMANDS } from './commands';
import { NodesModule } from '@modules/nodes/nodes.module';
import { DeviceAccessService } from './device-access.service';
import { HwidUserDevicesController } from './hwid-user-devices.controller';
import { HwidUserDevicesConverter } from './hwid-user-devices.converter';
import { HwidUserDevicesService } from './hwid-user-devices.service';
import { QUERIES } from './queries';
import { HwidUserDevicesRepository } from './repositories/hwid-user-devices.repository';

@Module({
    imports: [CqrsModule, NodesModule],
    controllers: [HwidUserDevicesController],
    providers: [
        HwidUserDevicesRepository,
        HwidUserDevicesConverter,
        HwidUserDevicesService,
        DeviceAccessService,
        ...COMMANDS,
        ...QUERIES,
    ],
    exports: [DeviceAccessService],
})
export class HwidUserDevicesModule {}

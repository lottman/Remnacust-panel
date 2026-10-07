import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { HwidUserDevicesModule } from '@modules/hwid-user-devices/hwid-user-devices.module';

import { COMMANDS } from './commands';
import { UsersController, UsersBulkActionsController } from './controllers';
import { QUERIES } from './queries';
import { UsersRepository } from './repositories/users.repository';
import { UserConverter } from './users.converter';
import { UsersService } from './users.service';
@Module({
    imports: [CqrsModule, HwidUserDevicesModule],
    controllers: [UsersController, UsersBulkActionsController],
    providers: [UsersRepository, UserConverter, UsersService, ...QUERIES, ...COMMANDS],
    exports: [],
})
export class UsersModule {}

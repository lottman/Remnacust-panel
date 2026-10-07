import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { PrismaModule } from '@common/database';

import { COMMANDS } from './commands';
import { CONTROLLERS } from './controllers';
import { PasskeyConverter } from './converters';
import { AdminConverter } from './converters/admin.converter';
import { QUERIES } from './queries';
import { AdminRepository } from './repositories/admin.repository';
import { PasskeyRepository } from './repositories/passkey.repository';
import { SERVICES } from './services';

@Module({
    imports: [CqrsModule, PrismaModule],
    controllers: [...CONTROLLERS],
    providers: [
        AdminRepository,
        AdminConverter,
        PasskeyRepository,
        PasskeyConverter,
        ...SERVICES,
        ...QUERIES,
        ...COMMANDS,
    ],
})
export class AdminModule {}

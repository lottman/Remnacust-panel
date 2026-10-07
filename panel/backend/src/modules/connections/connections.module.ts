import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';

@Module({
    imports: [CqrsModule],
    controllers: [ConnectionsController],
    providers: [ConnectionsService],
})
export class ConnectionsModule {}

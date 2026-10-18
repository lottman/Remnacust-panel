import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { SessionRecordingController } from './session-recording.controller';
import { SessionRecordingService } from './session-recording.service';

@Module({
    imports: [CqrsModule],
    controllers: [ConnectionsController, SessionRecordingController],
    providers: [ConnectionsService, SessionRecordingService],
})
export class ConnectionsModule {}

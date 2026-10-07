import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { TypedConfigService } from '@common/config/app-config';
import { EVENTS } from '@libs/contracts/constants';

import { ServiceEvent } from '@integration-modules/notifications/interfaces';

@Injectable()
export class RemnawaveServiceService implements OnApplicationBootstrap {
    constructor(
        private readonly eventEmitter: EventEmitter2,
        private readonly configService: TypedConfigService,
    ) {}

    public async onApplicationBootstrap(): Promise<void> {
        this.eventEmitter.emit(
            EVENTS.SERVICE.PANEL_STARTED,
            new ServiceEvent(EVENTS.SERVICE.PANEL_STARTED, {
                panelVersion: this.configService.getOrThrow('__RW_METADATA_VERSION'),
            }),
        );
    }
}

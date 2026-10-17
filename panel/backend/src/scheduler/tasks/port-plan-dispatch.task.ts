import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PortPlanDispatchService } from '@modules/nodes/port-plan-dispatch.service';

@Injectable()
export class PortPlanDispatchTask {
    constructor(private readonly dispatcher: PortPlanDispatchService) {}
    @Cron('*/10 * * * * *', { name: 'portPlanDispatch', waitForCompletion: true })
    async run(): Promise<void> {
        await this.dispatcher.dispatch();
    }
}

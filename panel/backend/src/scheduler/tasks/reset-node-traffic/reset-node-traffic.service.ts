import dayjs from 'dayjs';

import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Cron } from '@nestjs/schedule';

import { TResult } from '@common/types';

import { UpdateNodeCommand } from '@modules/nodes/commands/update-node';
import { NodesEntity } from '@modules/nodes/entities/nodes.entity';
import { GetAllNodesQuery } from '@modules/nodes/queries/get-all-nodes';

import { JOBS_INTERVALS } from '@scheduler/intervals';

@Injectable()
export class ResetNodeTrafficTask {
    private static readonly CRON_NAME = 'resetNodeTraffic';
    private readonly logger = new Logger(ResetNodeTrafficTask.name);

    constructor(
        private readonly queryBus: QueryBus,
        private readonly commandBus: CommandBus,
    ) {}

    @Cron(JOBS_INTERVALS.RESET_NODE_TRAFFIC, {
        name: ResetNodeTrafficTask.CRON_NAME,
        waitForCompletion: true,
    })
    async handleCron() {
        try {
            const nodesResponse = await this.getAllNodes();
            if (!nodesResponse.isOk) {
                return;
            }

            const nodes = nodesResponse.response;

            for (const node of nodes) {
                if (node.isTrafficTrackingActive === false) continue;

                const resetDay = node.trafficResetDay;
                if (resetDay === null || resetDay === 0) continue;

                const today = dayjs();
                const currentDay = today.date();
                const lastDayOfMonth = today.endOf('month').date();

                if (
                    (resetDay > lastDayOfMonth && currentDay === lastDayOfMonth) ||
                    currentDay === resetDay
                ) {
                    this.logger.log(`Resetting node traffic for ${node.uuid}`);

                    await this.commandBus.execute(
                        new UpdateNodeCommand({
                            uuid: node.uuid,
                            trafficUsedBytes: BigInt(0),
                        }),
                    );
                }
            }
        } catch (error) {
            this.logger.error(error);
        }
    }

    private async getAllNodes(): Promise<TResult<NodesEntity[]>> {
        return this.queryBus.execute<GetAllNodesQuery, TResult<NodesEntity[]>>(
            new GetAllNodesQuery(),
        );
    }
}

import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { BandwidthStatsNodesController } from './bandwidth-stats-nodes.controller';
import { BandwidthStatsUsersController } from './bandwidth-stats-users.controller';
import { COMMANDS } from './commands';
import { NodesUserUsageHistoryConverter } from './nodes-user-usage-history.converter';
import { NodesUserUsageHistoryService } from './nodes-user-usage-history.service';
import { QUERIES } from './queries';
import { NodesUserUsageHistoryRepository } from './repositories/nodes-user-usage-history.repository';

@Module({
    imports: [CqrsModule],
    controllers: [BandwidthStatsNodesController, BandwidthStatsUsersController],
    providers: [
        NodesUserUsageHistoryRepository,
        NodesUserUsageHistoryConverter,
        NodesUserUsageHistoryService,
        ...COMMANDS,
        ...QUERIES,
    ],
})
export class NodesUserUsageHistoryModule {}

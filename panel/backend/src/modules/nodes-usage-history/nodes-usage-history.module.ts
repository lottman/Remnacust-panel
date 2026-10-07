import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { COMMANDS } from './commands';
import { NodesUsageHistoryController } from './nodes-usage-history.controller';
import { NodesUsageHistoryConverter } from './nodes-usage-history.converter';
import { NodesUsageHistoryService } from './nodes-usage-history.service';
import { QUERIES } from './queries';
import { NodesUsageHistoryRepository } from './repositories/nodes-usage-history.repository';

@Module({
    imports: [CqrsModule],
    controllers: [NodesUsageHistoryController],
    providers: [
        NodesUsageHistoryService,
        NodesUsageHistoryRepository,
        NodesUsageHistoryConverter,
        ...COMMANDS,
        ...QUERIES,
    ],
})
export class NodesUsageHistoryModule {}

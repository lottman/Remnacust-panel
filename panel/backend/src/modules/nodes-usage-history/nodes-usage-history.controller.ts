import { Controller, HttpStatus, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeResource } from '@common/decorators/scopes';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ScopesGuard } from '@common/guards/scopes';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { BANDWIDTH_STATS_NODES_CONTROLLER, CONTROLLERS_INFO } from '@libs/contracts/api';
import { GetStatsNodesUsageCommand } from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import { GetStatsNodesUsageQueryDto, GetStatsNodesUsageResponseDto } from './dtos';
import { NodesUsageHistoryService } from './nodes-usage-history.service';

@ApiBearerAuth('Authorization')
@ApiScopeResource(CONTROLLERS_INFO.BANDWIDTH_STATS.resource)
@ApiTags(CONTROLLERS_INFO.BANDWIDTH_STATS.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(BANDWIDTH_STATS_NODES_CONTROLLER)
export class NodesUsageHistoryController {
    constructor(private readonly nodesUsageHistoryService: NodesUsageHistoryService) {}

    @Endpoint({
        command: GetStatsNodesUsageCommand,
        httpCode: HttpStatus.OK,
        type: GetStatsNodesUsageResponseDto,
    })
    async getStatsNodesUsage(
        @Query() query: GetStatsNodesUsageQueryDto,
    ): Promise<GetStatsNodesUsageResponseDto> {
        const { start, end, topNodesLimit } = query;

        const result = await this.nodesUsageHistoryService.getStatsNodesUsage(
            start,
            end,
            topNodesLimit,
        );

        const data = errorHandler(result);
        return {
            response: data,
        };
    }
}

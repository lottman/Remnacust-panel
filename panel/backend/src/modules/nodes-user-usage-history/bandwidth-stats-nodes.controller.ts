import { Body, Controller, HttpStatus, Param, Query, UseFilters, UseGuards } from '@nestjs/common';
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
import {
    GetNodeUsageCommand,
    GetStatsNodesUsersUsageCommand,
    GetStatsNodeUsersUsageCommand,
} from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import {
    GetNodeUsageBodyDto,
    GetNodeUsageQueryDto,
    GetNodeUsageResponseDto,
    GetStatsNodesUsersUsageBodyDto,
    GetStatsNodesUsersUsageQueryDto,
    GetStatsNodesUsersUsageResponseDto,
    GetStatsNodeUsersUsageParamDto,
    GetStatsNodeUsersUsageQueryDto,
    GetStatsNodeUsersUsageResponseDto,
} from './dtos';
import { NodesUserUsageHistoryService } from './nodes-user-usage-history.service';

@ApiBearerAuth('Authorization')
@ApiScopeResource(CONTROLLERS_INFO.BANDWIDTH_STATS.resource)
@ApiTags(CONTROLLERS_INFO.BANDWIDTH_STATS.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(BANDWIDTH_STATS_NODES_CONTROLLER)
export class BandwidthStatsNodesController {
    constructor(private readonly nodesUserUsageHistoryService: NodesUserUsageHistoryService) {}

    @Endpoint({
        command: GetNodeUsageCommand,
        httpCode: HttpStatus.OK,
        type: GetNodeUsageResponseDto,
    })
    async getNodeUsage(
        @Body() body: GetNodeUsageBodyDto,
        @Query() query: GetNodeUsageQueryDto,
    ): Promise<GetNodeUsageResponseDto> {
        const result = await this.nodesUserUsageHistoryService.getNodeUsage(body, query);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: GetStatsNodeUsersUsageCommand,
        httpCode: HttpStatus.OK,
        type: GetStatsNodeUsersUsageResponseDto,
    })
    async getStatsNodeUsersUsage(
        @Query() query: GetStatsNodeUsersUsageQueryDto,
        @Param() param: GetStatsNodeUsersUsageParamDto,
    ): Promise<GetStatsNodeUsersUsageResponseDto> {
        const result = await this.nodesUserUsageHistoryService.getStatsNodesUsersUsage(
            param.uuid,
            query.start,
            query.end,
            query.topUsersLimit,
        );
        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: GetStatsNodesUsersUsageCommand,
        httpCode: HttpStatus.OK,
        type: GetStatsNodesUsersUsageResponseDto,
    })
    async getStatsNodesUsersUsage(
        @Query() query: GetStatsNodesUsersUsageQueryDto,
        @Body() body: GetStatsNodesUsersUsageBodyDto,
    ): Promise<GetStatsNodesUsersUsageResponseDto> {
        const result = await this.nodesUserUsageHistoryService.getStatsNodesUsersUsageByNodesUuids(
            body.nodesUuids,
            query.start,
            query.end,
            query.topUsersLimit,
        );
        const data = errorHandler(result);
        return {
            response: data,
        };
    }
}

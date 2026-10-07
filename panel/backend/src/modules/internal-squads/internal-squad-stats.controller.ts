import { Controller, HttpStatus, Param, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeResource } from '@common/decorators/scopes';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ScopesGuard } from '@common/guards/scopes';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { BANDWIDTH_STATS_INTERNAL_SQUADS_CONTROLLER, CONTROLLERS_INFO } from '@libs/contracts/api';
import {
    GetInternalSquadUsageCommand,
    GetInternalSquadUserUsageCommand,
} from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import {
    GetInternalSquadUsageParamDto,
    GetInternalSquadUsageQueryDto,
    GetInternalSquadUsageResponseDto,
    GetInternalSquadUserUsageParamDto,
    GetInternalSquadUserUsageQueryDto,
    GetInternalSquadUserUsageResponseDto,
} from './dtos';
import { InternalSquadService } from './internal-squad.service';

@ApiBearerAuth('Authorization')
@ApiScopeResource(CONTROLLERS_INFO.BANDWIDTH_STATS.resource)
@ApiTags(CONTROLLERS_INFO.BANDWIDTH_STATS.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(BANDWIDTH_STATS_INTERNAL_SQUADS_CONTROLLER)
export class InternalSquadStatsController {
    constructor(private readonly internalSquadService: InternalSquadService) {}

    @Endpoint({
        command: GetInternalSquadUsageCommand,
        httpCode: HttpStatus.OK,
        type: GetInternalSquadUsageResponseDto,
    })
    async getInternalSquadUsage(
        @Param() param: GetInternalSquadUsageParamDto,
        @Query() query: GetInternalSquadUsageQueryDto,
    ): Promise<GetInternalSquadUsageResponseDto> {
        const result = await this.internalSquadService.getSquadUsage(param.uuid, query);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: GetInternalSquadUserUsageCommand,
        httpCode: HttpStatus.OK,
        type: GetInternalSquadUserUsageResponseDto,
    })
    async getInternalSquadUserUsage(
        @Param() param: GetInternalSquadUserUsageParamDto,
        @Query() query: GetInternalSquadUserUsageQueryDto,
    ): Promise<GetInternalSquadUserUsageResponseDto> {
        const result = await this.internalSquadService.getSquadUserUsage(
            param.squadUuid,
            param.userId,
            query,
        );

        const data = errorHandler(result);
        return {
            response: data,
        };
    }
}

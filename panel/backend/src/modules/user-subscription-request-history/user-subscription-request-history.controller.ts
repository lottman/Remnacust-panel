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
import { CONTROLLERS_INFO, SUBSCRIPTION_REQUEST_HISTORY_CONTROLLER } from '@libs/contracts/api';
import {
    GetSubscriptionRequestHistoryCommand,
    GetSubscriptionRequestHistoryStatsCommand,
} from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import {
    GetSubscriptionRequestHistoryQueryDto,
    GetSubscriptionRequestHistoryResponseDto,
    GetSubscriptionRequestHistoryStatsResponseDto,
} from './dtos';
import {
    BaseSubscriptionRequestHistoryResponseModel,
    GetSubscriptionRequestHistoryResponseModel,
} from './models';
import { UserSubscriptionRequestHistoryService } from './user-subscription-request-history.service';

@ApiBearerAuth('Authorization')
@ApiScopeResource(CONTROLLERS_INFO.SUBSCRIPTION_REQUEST_HISTORY.resource)
@ApiTags(CONTROLLERS_INFO.SUBSCRIPTION_REQUEST_HISTORY.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(SUBSCRIPTION_REQUEST_HISTORY_CONTROLLER)
export class UserSubscriptionRequestHistoryController {
    constructor(
        private readonly userSubscriptionRequestHistoryService: UserSubscriptionRequestHistoryService,
    ) {}

    @Endpoint({
        command: GetSubscriptionRequestHistoryCommand,
        httpCode: HttpStatus.OK,
        type: GetSubscriptionRequestHistoryResponseDto,
    })
    async getSubscriptionRequestHistory(
        @Query() query: GetSubscriptionRequestHistoryQueryDto,
    ): Promise<GetSubscriptionRequestHistoryResponseDto> {
        const { start, size, filters, filterModes, globalFilterMode, sorting } = query;
        const result =
            await this.userSubscriptionRequestHistoryService.getSubscriptionRequestHistory({
                start,
                size,
                filters,
                filterModes,
                globalFilterMode,
                sorting,
            });

        const data = errorHandler(result);
        return {
            response: new GetSubscriptionRequestHistoryResponseModel({
                total: data.total,
                records: data.records.map(
                    (item) => new BaseSubscriptionRequestHistoryResponseModel(item),
                ),
            }),
        };
    }

    @Endpoint({
        command: GetSubscriptionRequestHistoryStatsCommand,
        httpCode: HttpStatus.OK,
        type: GetSubscriptionRequestHistoryStatsResponseDto,
    })
    async getSubscriptionRequestHistoryStats(): Promise<GetSubscriptionRequestHistoryStatsResponseDto> {
        const result =
            await this.userSubscriptionRequestHistoryService.getSubscriptionRequestHistoryStats();

        const data = errorHandler(result);
        return {
            response: data,
        };
    }
}

import { CONTROLLERS_INFO, SUBSCRIPTION_SETTINGS_CONTROLLER } from '@contract/api';
import { ROLE } from '@contract/constants';

import { Body, Controller, HttpStatus, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeResource } from '@common/decorators/scopes';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ScopesGuard } from '@common/guards/scopes';
import { errorHandler } from '@common/helpers/error-handler.helper';
import {
    GetSubscriptionSettingsCommand,
    UpdateSubscriptionSettingsCommand,
} from '@libs/contracts/commands';

import {
    GetSubscriptionSettingsResponseDto,
    UpdateSubscriptionSettingsBodyDto,
    UpdateSubscriptionSettingsResponseDto,
} from './dtos';
import { SubscriptionSettingsResponseModel } from './models/get-subscription-settings.response.model';
import { SubscriptionSettingsService } from './subscription-settings.service';

@ApiBearerAuth('Authorization')
@ApiScopeResource(CONTROLLERS_INFO.SUBSCRIPTION_SETTINGS.resource)
@ApiTags(CONTROLLERS_INFO.SUBSCRIPTION_SETTINGS.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(SUBSCRIPTION_SETTINGS_CONTROLLER)
export class SubscriptionSettingsController {
    constructor(private readonly subscriptionSettingsService: SubscriptionSettingsService) {}

    @Endpoint({
        command: GetSubscriptionSettingsCommand,
        httpCode: HttpStatus.OK,
        type: GetSubscriptionSettingsResponseDto,
    })
    async getSettings(): Promise<GetSubscriptionSettingsResponseDto> {
        const result = await this.subscriptionSettingsService.getSubscriptionSettings();

        const data = errorHandler(result);
        return {
            response: new SubscriptionSettingsResponseModel(data),
        };
    }

    @Endpoint({
        command: UpdateSubscriptionSettingsCommand,
        httpCode: HttpStatus.OK,
        type: UpdateSubscriptionSettingsResponseDto,
    })
    async updateSettings(
        @Body() body: UpdateSubscriptionSettingsBodyDto,
    ): Promise<UpdateSubscriptionSettingsResponseDto> {
        const result = await this.subscriptionSettingsService.updateSettings(body);

        const data = errorHandler(result);
        return {
            response: new SubscriptionSettingsResponseModel(data),
        };
    }
}

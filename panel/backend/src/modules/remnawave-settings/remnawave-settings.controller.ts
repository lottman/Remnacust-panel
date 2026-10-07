import { AdminOnlyEndpoint } from '@common/decorators/admin-only-endpoint';
import { ApiScopeResource } from '@common/decorators/scopes';
import { ScopesGuard } from '@common/guards/scopes';
import { CONTROLLERS_INFO, REMNAWAVE_SETTINGS_CONTROLLER } from '@contract/api';
import { ROLE } from '@contract/constants';

import { Body, Controller, HttpStatus, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { errorHandler } from '@common/helpers/error-handler.helper';
import {
    GetRemnawaveSettingsCommand,
    UpdateRemnawaveSettingsCommand,
} from '@libs/contracts/commands';

import {
    GetRemnawaveSettingsResponseDto,
    UpdateRemnawaveSettingsBodyDto,
    UpdateRemnawaveSettingsResponseDto,
} from './dto';
import { RemnawaveSettingsResponseModel } from './models/get-remnawave-settings.response.model';
import { RemnawaveSettingsService } from './remnawave-settings.service';

@ApiBearerAuth('Authorization')
@ApiTags(CONTROLLERS_INFO.REMNAAWAVE_SETTINGS.tag)
@ApiScopeResource(CONTROLLERS_INFO.REMNAAWAVE_SETTINGS.resource)
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(REMNAWAVE_SETTINGS_CONTROLLER)
export class RemnawaveSettingsController {
    constructor(private readonly remnawaveSettingsService: RemnawaveSettingsService) {}

    @AdminOnlyEndpoint()
    @Endpoint({
        command: GetRemnawaveSettingsCommand,
        httpCode: HttpStatus.OK,
        type: GetRemnawaveSettingsResponseDto,
    })
    async getSettings(): Promise<GetRemnawaveSettingsResponseDto> {
        const result = await this.remnawaveSettingsService.getSettingsFromController();

        const data = errorHandler(result);
        return {
            response: new RemnawaveSettingsResponseModel(data),
        };
    }

    @AdminOnlyEndpoint()
    @Endpoint({
        command: UpdateRemnawaveSettingsCommand,
        httpCode: HttpStatus.OK,
        type: UpdateRemnawaveSettingsResponseDto,
    })
    async updateSettings(
        @Body() body: UpdateRemnawaveSettingsBodyDto,
    ): Promise<UpdateRemnawaveSettingsResponseDto> {
        const result = await this.remnawaveSettingsService.updateSettingsFromController(body);

        const data = errorHandler(result);
        return {
            response: new RemnawaveSettingsResponseModel(data),
        };
    }
}

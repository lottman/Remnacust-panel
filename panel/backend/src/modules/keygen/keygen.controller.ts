import { Controller, HttpStatus, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeResource } from '@common/decorators/scopes';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ScopesGuard } from '@common/guards/scopes';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { CONTROLLERS_INFO, KEYGEN_CONTROLLER } from '@libs/contracts/api';
import { GetNodeSecretKeyCommand } from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import { GetNodeSecretKeyResponseDto } from './dtos';
import { KeygenService } from './keygen.service';
import { KeygenResponseModel } from './model';

@ApiBearerAuth('Authorization')
@ApiScopeResource(CONTROLLERS_INFO.KEYGEN.resource)
@ApiTags(CONTROLLERS_INFO.KEYGEN.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(KEYGEN_CONTROLLER)
export class KeygenController {
    constructor(private readonly keygenService: KeygenService) {}

    @Endpoint({
        command: GetNodeSecretKeyCommand,
        httpCode: HttpStatus.OK,
        type: GetNodeSecretKeyResponseDto,
    })
    async generateKey(): Promise<GetNodeSecretKeyResponseDto> {
        const result = await this.keygenService.generateKey();

        const data = errorHandler(result);
        return {
            response: new KeygenResponseModel(data.payload),
        };
    }
}

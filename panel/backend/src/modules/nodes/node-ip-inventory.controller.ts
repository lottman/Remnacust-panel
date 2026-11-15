import { CONTROLLERS_INFO, NODES_CONTROLLER } from '@contract/api';
import { ROLE } from '@contract/constants';
import { createZodDto } from 'nestjs-zod';

import {
    Body,
    Controller,
    Header,
    HttpStatus,
    Param,
    UseFilters,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeResource } from '@common/decorators/scopes';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles/roles.guard';
import { ScopesGuard } from '@common/guards/scopes';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { RescanNodeIpsCommand } from '@libs/contracts/commands';

import { NodeResponseInterceptor } from './models/node-response.interceptor';
import { NodeIpInventoryService } from './node-ip-inventory.service';

export class RescanNodeIpsParamDto extends createZodDto(RescanNodeIpsCommand.RequestParamSchema) {}
export class RescanNodeIpsBodyDto extends createZodDto(RescanNodeIpsCommand.RequestBodySchema) {}
export class RescanNodeIpsResponseDto extends createZodDto(RescanNodeIpsCommand.ResponseSchema) {}

@ApiBearerAuth('Authorization')
@ApiScopeResource(CONTROLLERS_INFO.NODES.resource)
@ApiTags(CONTROLLERS_INFO.NODES.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseInterceptors(NodeResponseInterceptor)
@UseFilters(HttpExceptionFilter)
@Controller(NODES_CONTROLLER)
export class NodeIpInventoryController {
    constructor(private readonly inventory: NodeIpInventoryService) {}

    @Endpoint({
        command: RescanNodeIpsCommand,
        httpCode: HttpStatus.OK,
        type: RescanNodeIpsResponseDto,
    })
    @Header('Cache-Control', 'private, no-store')
    async rescan(@Param() params: RescanNodeIpsParamDto, @Body() body: RescanNodeIpsBodyDto) {
        return {
            response: errorHandler(await this.inventory.rescan(params.uuid, body.controlRevision)),
        };
    }
}

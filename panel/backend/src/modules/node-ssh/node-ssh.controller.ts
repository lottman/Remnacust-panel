import { ApiScopeResource } from '@common/decorators/scopes';
import { ScopesGuard } from '@common/guards/scopes';
import { CONTROLLERS_INFO, NODE_SSH_CONTROLLER } from '@contract/api';
import { ROLE } from '@contract/constants';

import { AdminOnlyEndpoint } from '@common/decorators/admin-only-endpoint';
import { Body, Controller, Get, ParseUUIDPipe, HttpStatus, Param, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { IpAddress } from '@common/decorators/get-ip';
import { GetJWTPayload } from '@common/decorators/get-jwt-payload';
import { Roles } from '@common/decorators/roles/roles';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles/roles.guard';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { CreateSshTicketCommand, EvaluateVaultCommand } from '@libs/contracts/commands';

import type { IJWTAuthPayload } from '@modules/auth/interfaces';

import {
    CreateSshTicketParamDto,
    CreateSshTicketResponseDto,
    EvaluateVaultRequestBodyDto,
    EvaluateVaultResponseDto,
} from './dtos';
import { NodeSshService } from './node-ssh.service';
import { VaultOprfService } from './vault-oprf.service';

@ApiBearerAuth('Authorization')
@ApiExcludeController()
@ApiTags(CONTROLLERS_INFO.NODE_SSH.tag)
@ApiScopeResource(CONTROLLERS_INFO.NODE_SSH.resource)
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(NODE_SSH_CONTROLLER)
export class NodeSshController {
    constructor(
        private readonly nodeSshService: NodeSshService,
        private readonly vaultOprfService: VaultOprfService,
    ) {}

    @AdminOnlyEndpoint()
    @Get(':uuid/optimization')
    async optimizationStatus(@Param('uuid', new ParseUUIDPipe()) uuid:string) {
        return {response:errorHandler(await this.nodeSshService.getOptimization(uuid))};
    }

    @AdminOnlyEndpoint()
    @Endpoint({
        command: CreateSshTicketCommand,
        httpCode: HttpStatus.CREATED,
        type: CreateSshTicketResponseDto,
    })
    async createTicket(
        @Param() param: CreateSshTicketParamDto,
        @GetJWTPayload() payload: IJWTAuthPayload,
        @IpAddress() clientIp: string,
    ): Promise<CreateSshTicketResponseDto> {
        const result = await this.nodeSshService.createTicket(param.uuid, payload, clientIp);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @AdminOnlyEndpoint()
    @Endpoint({
        command: EvaluateVaultCommand,
        httpCode: HttpStatus.OK,
        type: EvaluateVaultResponseDto,
    })
    async evaluateVault(
        @Body() body: EvaluateVaultRequestBodyDto,
        @GetJWTPayload() payload: IJWTAuthPayload,
    ): Promise<EvaluateVaultResponseDto> {
        const result = await this.vaultOprfService.evaluate(
            payload.uuid!,
            Buffer.from(body.blinded, 'base64'),
        );

        const data = errorHandler(result);
        return {
            response: data,
        };
    }
}

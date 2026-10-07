import { Body, Controller, HttpStatus, Param, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeResource } from '@common/decorators/scopes';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ScopesGuard } from '@common/guards/scopes';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { CONTROLLERS_INFO, METADATA_CONTROLLER } from '@libs/contracts/api';
import {
    GetNodeMetadataCommand,
    GetUserMetadataCommand,
    UpsertNodeMetadataCommand,
    UpsertUserMetadataCommand,
} from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import {
    GetNodeMetadataParamDto,
    GetNodeMetadataResponseDto,
    GetUserMetadataParamDto,
    GetUserMetadataResponseDto,
    UpsertNodeMetadataBodyDto,
    UpsertNodeMetadataResponseDto,
    UpsertUserMetadataBodyDto,
    UpsertUserMetadataResponseDto,
} from './dtos';
import { MetadataService } from './metadata.service';

@ApiBearerAuth('Authorization')
@ApiScopeResource(CONTROLLERS_INFO.METADATA.resource)
@ApiTags(CONTROLLERS_INFO.METADATA.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(METADATA_CONTROLLER)
export class MetadataController {
    constructor(private readonly metadataService: MetadataService) {}

    @Endpoint({
        command: GetUserMetadataCommand,
        httpCode: HttpStatus.OK,
        type: GetUserMetadataResponseDto,
    })
    async getUserMetadata(
        @Param() params: GetUserMetadataParamDto,
    ): Promise<GetUserMetadataResponseDto> {
        const result = await this.metadataService.getUserMetadata(params.userId);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: UpsertUserMetadataCommand,
        httpCode: HttpStatus.OK,
        type: UpsertUserMetadataResponseDto,
    })
    async upsertUserMetadata(
        @Param() params: GetUserMetadataParamDto,
        @Body() body: UpsertUserMetadataBodyDto,
    ): Promise<UpsertUserMetadataResponseDto> {
        const result = await this.metadataService.upsertUserMetadata(params.userId, body.metadata);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: GetNodeMetadataCommand,
        httpCode: HttpStatus.OK,
        type: GetNodeMetadataResponseDto,
    })
    async getNodeMetadata(
        @Param() params: GetNodeMetadataParamDto,
    ): Promise<GetNodeMetadataResponseDto> {
        const result = await this.metadataService.getNodeMetadata(params.uuid);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: UpsertNodeMetadataCommand,
        httpCode: HttpStatus.OK,
        type: UpsertNodeMetadataResponseDto,
    })
    async upsertNodeMetadata(
        @Param() params: GetNodeMetadataParamDto,
        @Body() body: UpsertNodeMetadataBodyDto,
    ): Promise<UpsertNodeMetadataResponseDto> {
        const result = await this.metadataService.upsertNodeMetadata(params.uuid, body.metadata);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }
}

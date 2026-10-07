import { AdminOnlyEndpoint } from '@common/decorators/admin-only-endpoint';
import { CONTROLLERS_INFO } from '@contract/api';
import { ROLE } from '@contract/constants';

import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    UseFilters,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeEndpoint, ApiScopeResource } from '@common/decorators/scopes';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles/roles.guard';
import { ScopesGuard } from '@common/guards/scopes';
import { getEndpointDetails } from '@libs/contracts/constants';

import { CoreManagementService } from './core-management.service';
import { coreJobSchema } from './core-management.types';

@ApiBearerAuth('Authorization')
@ApiTags('Core management')
@ApiScopeResource(CONTROLLERS_INFO.NODES.resource)
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller('nodes/core-management')
export class CoreManagementController {
    constructor(private readonly service: CoreManagementService) {}

    @AdminOnlyEndpoint()
    @Get('catalog')
    @ApiScopeEndpoint(
        getEndpointDetails('catalog', 'get', 'List approved Xray Core releases', {
            scope: 'core-catalog',
            kind: 'read',
        }),
    )
    catalog() {
        return { response: this.service.catalog() };
    }

    @AdminOnlyEndpoint()
    @Get('status/:uuid')
    @ApiScopeEndpoint(
        getEndpointDetails('status/:uuid', 'get', 'Get node Xray Core status', {
            scope: 'core-status',
            kind: 'read',
        }),
    )
    async status(@Param('uuid', ParseUUIDPipe) uuid: string) {
        return { response: await this.service.status(uuid) };
    }

    @AdminOnlyEndpoint()
    @Get('jobs')
    @ApiScopeEndpoint(
        getEndpointDetails('jobs', 'get', 'List Xray Core jobs', {
            scope: 'core-jobs-list',
            kind: 'read',
        }),
    )
    async list() {
        return { response: await this.service.list() };
    }

    @AdminOnlyEndpoint()
    @Get('jobs/:id')
    @ApiScopeEndpoint(
        getEndpointDetails('jobs/:id', 'get', 'Get Xray Core job details', {
            scope: 'core-jobs-detail',
            kind: 'read',
        }),
    )
    async detail(@Param('id', ParseUUIDPipe) id: string) {
        return { response: await this.service.detail(id) };
    }

    @AdminOnlyEndpoint()
    @Post('jobs')
    @ApiScopeEndpoint(
        getEndpointDetails('jobs', 'post', 'Create Xray Core job', {
            scope: 'core-jobs-create',
            kind: 'write',
        }),
    )
    async create(@Body() body: unknown) {
        const parsed = coreJobSchema.safeParse(body);
        if (!parsed.success) throw new BadRequestException('Invalid core operation');
        return { response: await this.service.create(parsed.data) };
    }

    @AdminOnlyEndpoint()
    @Post('jobs/:id/cancel')
    @ApiScopeEndpoint(
        getEndpointDetails('jobs/:id/cancel', 'post', 'Cancel Xray Core job', {
            scope: 'core-jobs-cancel',
            kind: 'write',
        }),
    )
    async cancel(@Param('id', ParseUUIDPipe) id: string) {
        return { response: await this.service.cancel(id) };
    }
}

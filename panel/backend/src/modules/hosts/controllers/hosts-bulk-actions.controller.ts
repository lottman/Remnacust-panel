import { Body, Controller, HttpStatus, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeResource } from '@common/decorators/scopes';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles/roles.guard';
import { ScopesGuard } from '@common/guards/scopes';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { CONTROLLERS_INFO, HOSTS_CONTROLLER } from '@libs/contracts/api';
import {
    BulkDisableHostsCommand,
    BulkEnableHostsCommand,
    BulkDeleteHostsCommand,
    UpdateManyHostsCommand,
} from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import {
    BulkDeleteHostsBodyDto,
    BulkDisableHostsBodyDto,
    BulkEnableHostsBodyDto,
    UpdateManyHostsBodyDto,
} from '../dtos/bulk-operations.dto';
import { HostsService } from '../hosts.service';

@ApiBearerAuth('Authorization')
@ApiScopeResource(CONTROLLERS_INFO.HOSTS_BULK_ACTIONS.resource)
@ApiTags(CONTROLLERS_INFO.HOSTS_BULK_ACTIONS.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(HOSTS_CONTROLLER)
export class HostsBulkActionsController {
    constructor(private readonly hostsService: HostsService) {}

    @Endpoint({
        command: BulkDeleteHostsCommand,
        httpCode: HttpStatus.NO_CONTENT,
    })
    async deleteHosts(@Body() body: BulkDeleteHostsBodyDto) {
        const result = await this.hostsService.deleteHosts(body.uuids);
        errorHandler(result);
        await this.hostsService.synchronizeCommittedPolicies();
        return;
    }

    @Endpoint({
        command: BulkDisableHostsCommand,
        httpCode: HttpStatus.NO_CONTENT,
    })
    async disableHosts(@Body() body: BulkDisableHostsBodyDto) {
        const result = await this.hostsService.bulkDisableHosts(body.uuids);
        errorHandler(result);
        await this.hostsService.synchronizeCommittedPolicies();
        return;
    }

    @Endpoint({
        command: BulkEnableHostsCommand,
        httpCode: HttpStatus.NO_CONTENT,
    })
    async enableHosts(@Body() body: BulkEnableHostsBodyDto) {
        const result = await this.hostsService.bulkEnableHosts(body.uuids);
        errorHandler(result);
        await this.hostsService.synchronizeCommittedPolicies();
        return;
    }

    @Endpoint({
        command: UpdateManyHostsCommand,
        httpCode: HttpStatus.NO_CONTENT,
    })
    async setPortToHosts(@Body() body: UpdateManyHostsBodyDto) {
        const result = await this.hostsService.updateManyHosts(body);

        errorHandler(result);
        await this.hostsService.synchronizeCommittedPolicies();
        return;
    }
}

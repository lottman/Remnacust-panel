import { CONTROLLERS_INFO, NODE_PLUGINS_CONTROLLER } from '@contract/api';
import { ROLE } from '@contract/constants';

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
import {
    GetTorrentBlockerReportsCommand,
    TruncateTorrentBlockerReportsCommand,
} from '@libs/contracts/commands';
import { GetTorrentBlockerReportsStatsCommand } from '@libs/contracts/commands/node-plugins/torrent-blocker/get-torrent-blocker-reports-stats.command';

import {
    GetTorrentBlockerReportsResponseDto,
    GetTorrentBlockerReportsQueryDto,
    GetTorrentBlockerReportsStatsResponseDto,
} from './dtos/node-plugins.dtos';
import { GetTorrentBlockerReportsResponseModel, TorrentBlockerReportResponseModel } from './models';
import { NodePluginService } from './node-plugins.service';

@ApiBearerAuth('Authorization')
@ApiScopeResource(CONTROLLERS_INFO.NODE_PLUGINS.resource)
@ApiTags(CONTROLLERS_INFO.NODE_PLUGINS.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(NODE_PLUGINS_CONTROLLER)
export class TorrentBlockerReportsController {
    constructor(private readonly nodePluginService: NodePluginService) {}

    @Endpoint({
        type: GetTorrentBlockerReportsResponseDto,
        command: GetTorrentBlockerReportsCommand,
        httpCode: HttpStatus.OK,
    })
    async getTorrentBlockerReports(
        @Query() query: GetTorrentBlockerReportsQueryDto,
    ): Promise<GetTorrentBlockerReportsResponseDto> {
        const { start, size, filters, filterModes, globalFilterMode, sorting } = query;
        const result = await this.nodePluginService.getTorrentBlockerReports({
            start,
            size,
            filters,
            filterModes,
            globalFilterMode,
            sorting,
        });

        const data = errorHandler(result);
        return {
            response: new GetTorrentBlockerReportsResponseModel({
                total: data.total,
                records: data.records.map((item) => new TorrentBlockerReportResponseModel(item)),
            }),
        };
    }

    @Endpoint({
        type: GetTorrentBlockerReportsStatsResponseDto,
        command: GetTorrentBlockerReportsStatsCommand,
        httpCode: HttpStatus.OK,
    })
    async getTorrentBlockerReportsStats(): Promise<GetTorrentBlockerReportsStatsResponseDto> {
        const result = await this.nodePluginService.getTorrentBlockerReportsStats();

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: TruncateTorrentBlockerReportsCommand,
        httpCode: HttpStatus.NO_CONTENT,
    })
    async truncateTorrentBlockerReports() {
        const result = await this.nodePluginService.truncateTorrentBlockerReports();

        errorHandler(result);
        return;
    }
}

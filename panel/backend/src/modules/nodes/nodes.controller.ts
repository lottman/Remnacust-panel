import { AdminOnlyEndpoint } from '@common/decorators/admin-only-endpoint';
import { getEndpointDetails } from '@libs/contracts/constants';
import { CONTROLLERS_INFO, NODES_CONTROLLER } from '@contract/api';
import { ROLE } from '@contract/constants';

import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseFilters, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { AxiosService } from '@common/axios';
import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeEndpoint, ApiScopeResource } from '@common/decorators/scopes';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles/roles.guard';
import { ScopesGuard } from '@common/guards/scopes';
import { errorHandler } from '@common/helpers/error-handler.helper';
import {
    CreateNodeCommand,
    DeleteNodeCommand,
    DisableNodeCommand,
    EnableNodeCommand,
    GetNodesCommand,
    GetNodesTagsCommand,
    GetNodeCommand,
    GetTrafficPathsCommand,
    BulkNodesProfileModificationCommand,
    ReorderNodesCommand,
    ResetNodeTrafficCommand,
    RestartAllNodesCommand,
    RestartNodeCommand,
    UpdateNodeCommand,
    BulkNodesActionsCommand,
    BulkNodesUpdateCommand,
} from '@libs/contracts/commands';

import {
    BulkNodesActionsBodyDto,
    BulkNodesUpdateBodyDto,
    CreateNodeBodyDto,
    DeleteNodeParamDto,
    DisableNodeParamDto,
    GetNodesResponseDto,
    GetTrafficPathsQueryDto,
    GetTrafficPathsResponseDto,
    GetNodesTagsResponseDto,
    GetNodeParamDto,
    ProfileModificationBodyDto,
    ReorderNodesBodyDto,
    ResetNodeTrafficParamDto,
    RestartNodeParamDto,
    RestartNodeBodyDto,
    EnableNodeParamDto,
    UpdateNodeBodyDto,
    RestartAllNodesBodyDto,
    ReorderNodesResponseDto,
    NodeResponseDto,
} from './dtos';
import { GetAllNodesTagsResponseModel } from './models';
import { GetNodeRuntimeCommand } from '@libs/contracts/commands';
import { GetNodeRuntimeResponseDto } from './dtos/get-runtime.dto';
import { NodeRuntimeService } from './node-runtime.service';
import { NodesService } from './nodes.service';
import { NodeHealthLogService } from './node-health-log.service';
import { GetEnabledNodesPartialQuery } from './queries/get-enabled-nodes-partial/get-enabled-nodes-partial.query';
import { NodesQueuesService } from '@queue/_nodes';
import { GetUserTrafficPathsQuery } from './queries/get-user-traffic-paths';

@ApiBearerAuth('Authorization')
@ApiScopeResource(CONTROLLERS_INFO.NODES.resource)
@ApiTags(CONTROLLERS_INFO.NODES.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(NODES_CONTROLLER)
export class NodesController {
    constructor(
        private readonly nodesService: NodesService,
        private readonly runtime: NodeRuntimeService,
        private readonly queryBus: QueryBus,
        private readonly healthLog: NodeHealthLogService,
        private readonly nodesQueuesService: NodesQueuesService,
        private readonly nodeAxios: AxiosService,
    ) {}

    @Endpoint({command: GetNodeRuntimeCommand, httpCode: HttpStatus.OK, type: GetNodeRuntimeResponseDto})
    getRuntime(@Param('uuid', new ParseUUIDPipe()) uuid: string) {
        return this.runtime.get(uuid);
    }

    @AdminOnlyEndpoint()
    @Get('health/retention')
    @ApiScopeEndpoint(getEndpointDetails('health/retention', 'get', 'Get node health log retention', { scope: 'health-retention-get', kind: 'read' }))
    async getHealthRetention() {
        return { response: { days: await this.healthLog.retentionDays() } };
    }

    @AdminOnlyEndpoint()
    @Post('health/retention')
    @HttpCode(HttpStatus.OK)
    @ApiScopeEndpoint(getEndpointDetails('health/retention', 'post', 'Set node health log retention', { scope: 'health-retention-set', kind: 'write' }))
    async setHealthRetention(@Body() body: { days?: unknown }) {
        if (!Number.isInteger(body?.days) || Number(body.days) < 1 || Number(body.days) > 365) {
            throw new BadRequestException('Retention must be 1–365 days');
        }
        return { response: { days: await this.healthLog.setRetentionDays(Number(body.days)) } };
    }

    @Get('health/:uuid/xray-logs')
    @ApiScopeEndpoint(getEndpointDetails('health/:uuid/xray-logs', 'get', 'Get node Xray logs', { scope: 'xray-logs', kind: 'read' }))
    async getNodeXrayLogs(@Param('uuid', new ParseUUIDPipe()) uuid: string) {
        const nodes = await this.queryBus.execute(new GetEnabledNodesPartialQuery());
        if (!nodes.isOk) throw new BadRequestException('Could not load enabled nodes');
        const node = nodes.response.find((item) => item.uuid === uuid);
        if (!node) throw new BadRequestException('Node is disabled or not found');
        const result = await this.nodeAxios.getNodeXrayLogs(node.connectionOpts);
        if (!result.isOk) throw new BadRequestException('Xray logs are not available from this node');
        return { response: result.response };
    }

    @AdminOnlyEndpoint()
    @Post('health/:uuid/check')
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiScopeEndpoint(getEndpointDetails('health/:uuid/check', 'post', 'Check node health now', { scope: 'health-check', kind: 'write' }))
    async checkNodeHealthNow(@Param('uuid', new ParseUUIDPipe()) uuid: string) {
        const result = await this.queryBus.execute(new GetEnabledNodesPartialQuery());
        if (!result.isOk) throw new BadRequestException('Could not load enabled nodes');
        const node = result.response.find((item) => item.uuid === uuid);
        if (!node) throw new BadRequestException('Node is disabled or not found');
        await this.nodesQueuesService.checkNodeHealthBulk([node]);
        return { response: { queued: true } };
    }

    @Get('health/:uuid')
    @ApiScopeEndpoint(getEndpointDetails('health/:uuid', 'get', 'Get node health log', { scope: 'health-log-list', kind: 'read' }))
    async getHealthLog(
        @Param('uuid', new ParseUUIDPipe()) uuid: string,
        @Query('status') status = 'all',
        @Query('limit') requestedLimit = '100',
        @Query('before') before?: string,
    ) {
        if (!['all', 'ok', 'retry', 'unreachable', 'xray_missing', 'error'].includes(status)) {
            throw new BadRequestException('Unknown health log status');
        }
        const limit = Number(requestedLimit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
            throw new BadRequestException('Limit must be 1–200');
        }
        if (before && (!/^[0-9]+$/.test(before) || BigInt(before) > 9223372036854775807n)) {
            throw new BadRequestException('Invalid health log cursor');
        }
        return { response: await this.healthLog.list(uuid, status, limit, before ? BigInt(before) : null) };
    }

    @AdminOnlyEndpoint()
    @Delete('health/:uuid')
    @ApiScopeEndpoint(getEndpointDetails('health/:uuid', 'delete', 'Clear node health log', { scope: 'health-log-clear', kind: 'write' }))
    async clearHealthLog(@Param('uuid', new ParseUUIDPipe()) uuid: string) {
        return { response: { deleted: await this.healthLog.clear(uuid) } };
    }

    @Endpoint({
        type: GetNodesTagsResponseDto,
        command: GetNodesTagsCommand,
        httpCode: HttpStatus.OK,
    })
    async getNodesTags(): Promise<GetNodesTagsResponseDto> {
        const res = await this.nodesService.getAllNodesTags();
        const data = errorHandler(res);
        return {
            response: new GetAllNodesTagsResponseModel(data),
        };
    }

    @Endpoint({
        type: NodeResponseDto,
        command: CreateNodeCommand,
        httpCode: HttpStatus.CREATED,
    })
    async createNode(@Body() body: CreateNodeBodyDto): Promise<NodeResponseDto> {
        const result = await this.nodesService.createNode(body);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Endpoint({
        type: GetNodesResponseDto,
        command: GetNodesCommand,
        httpCode: HttpStatus.OK,
    })
    async getNodes(): Promise<GetNodesResponseDto> {
        const res = await this.nodesService.getAllNodes();
        const data = errorHandler(res);
        return {
            response: data,
        };
    }

    @AdminOnlyEndpoint()
    @Endpoint({
        type: GetTrafficPathsResponseDto,
        command: GetTrafficPathsCommand,
        httpCode: HttpStatus.OK,
    })
    async getTrafficPaths(
        @Query() query: GetTrafficPathsQueryDto,
    ): Promise<GetTrafficPathsResponseDto> {
        const result = await this.queryBus.execute(
            new GetUserTrafficPathsQuery(query.userShortUuid),
        );
        return { response: errorHandler(result) };
    }

    @Endpoint({
        type: NodeResponseDto,
        command: GetNodeCommand,
        httpCode: HttpStatus.OK,
    })
    async getNode(@Param() uuid: GetNodeParamDto): Promise<NodeResponseDto> {
        const res = await this.nodesService.getOneNode(uuid.uuid);
        const data = errorHandler(res);
        return {
            response: data,
        };
    }

    @Endpoint({
        type: NodeResponseDto,
        command: EnableNodeCommand,
        httpCode: HttpStatus.OK,
    })
    async enableNode(@Param() param: EnableNodeParamDto): Promise<NodeResponseDto> {
        const res = await this.nodesService.enableNode(param.uuid);
        const data = errorHandler(res);
        return {
            response: data,
        };
    }

    @Endpoint({
        type: NodeResponseDto,
        command: DisableNodeCommand,
        httpCode: HttpStatus.OK,
    })
    async disableNode(@Param() param: DisableNodeParamDto): Promise<NodeResponseDto> {
        const res = await this.nodesService.disableNode(param.uuid);
        const data = errorHandler(res);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: DeleteNodeCommand,
        httpCode: HttpStatus.NO_CONTENT,
    })
    async deleteNode(@Param() param: DeleteNodeParamDto) {
        const res = await this.nodesService.deleteNode(param.uuid);
        errorHandler(res);
        return;
    }

    @Endpoint({
        type: NodeResponseDto,
        command: UpdateNodeCommand,
        httpCode: HttpStatus.OK,
    })
    async updateNode(@Body() body: UpdateNodeBodyDto): Promise<NodeResponseDto> {
        const res = await this.nodesService.updateNode(body);
        const data = errorHandler(res);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: RestartNodeCommand,
        httpCode: HttpStatus.ACCEPTED,
    })
    async restartNode(@Param() param: RestartNodeParamDto, @Body() body: RestartNodeBodyDto) {
        const res = await this.nodesService.restartNode(param.uuid, body.forceRestart);
        errorHandler(res);
        return;
    }

    @Endpoint({
        command: ResetNodeTrafficCommand,
        httpCode: HttpStatus.NO_CONTENT,
    })
    async resetNodeTraffic(@Param() param: ResetNodeTrafficParamDto) {
        const res = await this.nodesService.resetNodeTraffic(param.uuid);
        errorHandler(res);
        return;
    }

    @Endpoint({
        command: RestartAllNodesCommand,
        httpCode: HttpStatus.ACCEPTED,
    })
    async restartAllNodes(@Body() body: RestartAllNodesBodyDto) {
        const res = await this.nodesService.restartAllNodes(body.forceRestart);
        errorHandler(res);
        return;
    }

    @Endpoint({
        type: ReorderNodesResponseDto,
        command: ReorderNodesCommand,
        httpCode: HttpStatus.OK,
    })
    async reorderNodes(@Body() body: ReorderNodesBodyDto): Promise<ReorderNodesResponseDto> {
        const result = await this.nodesService.reorderNodes(body);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: BulkNodesProfileModificationCommand,
        httpCode: HttpStatus.NO_CONTENT,
    })
    async profileModification(@Body() body: ProfileModificationBodyDto) {
        const result = await this.nodesService.profileModification(body);

        errorHandler(result);
        return;
    }

    @Endpoint({
        command: BulkNodesActionsCommand,
        httpCode: HttpStatus.NO_CONTENT,
    })
    async bulkNodesActions(@Body() body: BulkNodesActionsBodyDto) {
        const result = await this.nodesService.bulkNodesActions(body);

        errorHandler(result);
        return;
    }

    @Endpoint({ command: BulkNodesUpdateCommand, httpCode: HttpStatus.NO_CONTENT })
    async bulkNodesUpdate(@Body() body: BulkNodesUpdateBodyDto) {
        const result = await this.nodesService.bulkNodesUpdate(body);
        errorHandler(result);
        return;
    }
}

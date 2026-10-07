import { Transactional } from '@nestjs-cls/transactional';

import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpStatus,
    Param,
    Put,
    UseFilters,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AdminOnlyEndpoint } from '@common/decorators/admin-only-endpoint';
import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeEndpoint, ApiScopeResource } from '@common/decorators/scopes';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles/roles.guard';
import { ScopesGuard } from '@common/guards/scopes';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { CONTROLLERS_INFO, HOSTS_CONTROLLER } from '@libs/contracts/api';
import {
    CloneHostCommand,
    RegenerateHostSniCommand,
    CreateHostCommand,
    DeleteHostCommand,
    GetHostsCommand,
    GetHostsTagsCommand,
    GetHostCommand,
    ReorderHostsCommand,
    UpdateHostCommand,
} from '@libs/contracts/commands';
import { getEndpointDetails } from '@libs/contracts/constants';
import { ROLE } from '@libs/contracts/constants';

import {
    CloneHostBodyDto,
    RegenerateHostSniBodyDto,
    ReorderHostsBodyDto,
    ReorderHostsResponseDto,
    GetHostsTagsResponseDto,
    HostResponseDto,
    CreateHostBodyDto,
    DeleteHostParamDto,
    GetHostsResponseDto,
    UpdateHostBodyDto,
    GetHostParamDto,
} from '../dtos';
import { HostsService } from '../hosts.service';
import { GetAllHostTagsResponseModel, HostResponseModel } from '../models';
import { HostTagLimitsRepository } from '../repositories/host-tag-limits.repository';
import { HostsRepository } from '../repositories/hosts.repository';

@ApiBearerAuth('Authorization')
@ApiScopeResource(CONTROLLERS_INFO.HOSTS.resource)
@ApiTags(CONTROLLERS_INFO.HOSTS.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(HOSTS_CONTROLLER)
export class HostsController {
    constructor(
        private readonly hostsService: HostsService,
        private readonly hostsRepository: HostsRepository,
        private readonly tagLimitsRepository: HostTagLimitsRepository,
    ) {}

    @Get('panel-tag-limits')
    @AdminOnlyEndpoint()
    @ApiScopeEndpoint(
        getEndpointDetails('panel-tag-limits', 'get', 'Get host tag traffic and speed limits', {
            scope: 'tag-limits-list',
            kind: 'read',
        }),
    )
    async getTagLimits() {
        const limits = await this.tagLimitsRepository.list();
        return {
            response: limits.map((item) => ({
                tag: item.tag,
                limitBytes: Number(item.limitBytes),
                speedLimitMbps: item.speedLimitMbps,
                totalSpeedLimitMbps: item.totalSpeedLimitMbps,
                trafficMultiplier: item.trafficMultiplier,
                resetValue: item.resetValue,
                resetUnit: item.resetUnit,
                resetAnchorAt: item.resetAnchorAt.toISOString(),
            })),
        };
    }

    @Put('panel-tag-limits')
    @AdminOnlyEndpoint()
    @Transactional()
    @ApiScopeEndpoint(
        getEndpointDetails('panel-tag-limits', 'put', 'Set host tag traffic and speed limits', {
            scope: 'tag-limits-set',
            kind: 'write',
        }),
    )
    async setTagLimit(
        @Body() body: {
            tag?: unknown;
            limitBytes?: unknown;
            speedLimitMbps?: unknown;
            totalSpeedLimitMbps?: unknown;
            trafficMultiplier?: unknown;
            resetValue?: unknown;
            resetUnit?: unknown;
        },
    ) {
        await this.hostsRepository.lockPolicies();
        const { tag, limitBytes } = body ?? {};
        const existing =
            typeof tag === 'string'
                ? (await this.tagLimitsRepository.list()).find((item) => item.tag === tag)
                : undefined;
        const totalSpeedLimitMbps =
            body?.totalSpeedLimitMbps === undefined
                ? (existing?.totalSpeedLimitMbps ?? null)
                : body.totalSpeedLimitMbps;
        const trafficMultiplier =
            body?.trafficMultiplier === undefined
                ? (existing?.trafficMultiplier ?? 1)
                : body.trafficMultiplier;
        const speedLimitMbps =
            body?.speedLimitMbps === undefined
                ? (existing?.speedLimitMbps ?? null)
                : body.speedLimitMbps;
        const resetValue =
            body?.resetValue === undefined ? (existing?.resetValue ?? 0) : body.resetValue;
        const resetUnit =
            body?.resetUnit === undefined ? (existing?.resetUnit ?? 'DAYS') : body.resetUnit;
        if (
            typeof tag !== 'string' ||
            !tag.trim() ||
            tag.length > 100 ||
            Array.from(tag).some(
                (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
            ) ||
            typeof limitBytes !== 'number' ||
            !Number.isSafeInteger(limitBytes) ||
            limitBytes < 0 ||
            (speedLimitMbps !== null &&
                (typeof speedLimitMbps !== 'number' ||
                    !Number.isSafeInteger(speedLimitMbps) ||
                    speedLimitMbps < 0 ||
                    speedLimitMbps > 10000)) ||
            (totalSpeedLimitMbps !== null &&
                (typeof totalSpeedLimitMbps !== 'number' ||
                    !Number.isSafeInteger(totalSpeedLimitMbps) ||
                    totalSpeedLimitMbps < 0 ||
                    totalSpeedLimitMbps > 10000)) ||
            typeof trafficMultiplier !== 'number' ||
            !Number.isFinite(trafficMultiplier) ||
            trafficMultiplier < 0.01 ||
            trafficMultiplier > 100 ||
            Math.abs(trafficMultiplier * 100 - Math.round(trafficMultiplier * 100)) > 1e-8 ||
            typeof resetValue !== 'number' ||
            !Number.isSafeInteger(resetValue) ||
            resetValue < 0 ||
            resetValue > (resetUnit === 'MONTHS' ? 120 : 3650) ||
            (resetUnit !== 'DAYS' && resetUnit !== 'MONTHS')
        ) {
            throw new BadRequestException('Invalid tag or traffic limit');
        }
        const hosts = await this.hostsRepository.findAll();
        const members = hosts.filter((host) => host.tags.includes(tag));
        await this.hostsService.validatePolicyState(
            hosts,
            [
                ...(await this.tagLimitsRepository.list()).filter((item) => item.tag !== tag),
                { tag },
            ],
            false,
            new Set(members.map((host) => host.uuid)),
        );
        await this.tagLimitsRepository.set(
            tag,
            BigInt(limitBytes),
            resetValue,
            resetUnit,
            speedLimitMbps,
            totalSpeedLimitMbps,
            trafficMultiplier,
        );
        // The setting is durable even while a node is offline. Synchronize after
        // the transaction commits; the scheduled task retries unavailable nodes.
        setImmediate(() => void this.hostsService.synchronizeCommittedPolicies());
        return {
            response: {
                tag,
                limitBytes,
                resetValue,
                resetUnit,
                speedLimitMbps,
                totalSpeedLimitMbps,
                trafficMultiplier,
            },
        };
    }

    @Delete('panel-tag-limits')
    @AdminOnlyEndpoint()
    @Transactional()
    @ApiScopeEndpoint(
        getEndpointDetails('panel-tag-limits', 'delete', 'Delete host tag limits', {
            scope: 'tag-limits-delete',
            kind: 'write',
        }),
    )
    async deleteTagLimit(@Body() body: { tag?: unknown }) {
        await this.hostsRepository.lockPolicies();
        if (typeof body?.tag !== 'string' || !body.tag.trim()) {
            throw new BadRequestException('Invalid tag');
        }
        const hosts = await this.hostsRepository.findAll();
        await this.hostsService.validatePolicyState(
            hosts,
            (await this.tagLimitsRepository.list()).filter((item) => item.tag !== body.tag),
            false,
            new Set(
                hosts
                    .filter((host) => host.tags.includes(body.tag as string))
                    .map((host) => host.uuid),
            ),
        );
        await this.tagLimitsRepository.delete(body.tag);
        setImmediate(() => void this.hostsService.synchronizeCommittedPolicies());
        return { response: { tag: body.tag } };
    }

    @Endpoint({
        command: GetHostsTagsCommand,
        httpCode: HttpStatus.OK,
        type: GetHostsTagsResponseDto,
    })
    async getHostsTags(): Promise<GetHostsTagsResponseDto> {
        const result = await this.hostsService.getHostsTags();

        const data = errorHandler(result);
        return {
            response: new GetAllHostTagsResponseModel(data),
        };
    }

    @Endpoint({
        command: CreateHostCommand,
        httpCode: HttpStatus.CREATED,
        type: HostResponseDto,
    })
    async createHost(@Body() body: CreateHostBodyDto): Promise<HostResponseDto> {
        const result = await this.hostsService.createHost(body);

        const data = errorHandler(result);
        await this.hostsService.synchronizeCommittedPolicies();
        return {
            response: new HostResponseModel(data),
        };
    }

    @Endpoint({
        command: UpdateHostCommand,
        httpCode: HttpStatus.OK,
        type: HostResponseDto,
    })
    async updateHost(@Body() body: UpdateHostBodyDto): Promise<HostResponseDto> {
        const result = await this.hostsService.updateHost(body);

        const data = errorHandler(result);
        // The write is committed. A scheduled sync retries unavailable nodes.
        setImmediate(() => void this.hostsService.synchronizeCommittedPolicies());
        return {
            response: new HostResponseModel(data),
        };
    }

    @Endpoint({
        command: GetHostsCommand,
        httpCode: HttpStatus.OK,
        type: GetHostsResponseDto,
    })
    async getHosts(): Promise<GetHostsResponseDto> {
        const result = await this.hostsService.getHosts();

        const data = errorHandler(result);
        return {
            response: data.map((host) => new HostResponseModel(host)),
        };
    }

    @Endpoint({
        command: GetHostCommand,
        httpCode: HttpStatus.OK,
        type: HostResponseDto,
    })
    async getOneHost(@Param() params: GetHostParamDto): Promise<HostResponseDto> {
        const result = await this.hostsService.getHost(params.uuid);

        const data = errorHandler(result);
        return {
            response: new HostResponseModel(data),
        };
    }

    @Endpoint({
        command: CloneHostCommand,
        httpCode: HttpStatus.CREATED,
        type: HostResponseDto,
    })
    async cloneHost(@Body() body: CloneHostBodyDto): Promise<HostResponseDto> {
        const result = await this.hostsService.cloneHost(body.cloneFromUuid);

        const data = errorHandler(result);
        await this.hostsService.synchronizeCommittedPolicies();
        return {
            response: new HostResponseModel(data),
        };
    }

    @AdminOnlyEndpoint()
    @Endpoint({
        command: RegenerateHostSniCommand,
        httpCode: HttpStatus.OK,
        type: HostResponseDto,
    })
    async regenerateHostSni(@Body() body: RegenerateHostSniBodyDto): Promise<HostResponseDto> {
        const result = await this.hostsService.regenerateHostSni(body.uuid);

        const data = errorHandler(result);
        return {
            response: new HostResponseModel(data),
        };
    }

    @Endpoint({
        command: ReorderHostsCommand,
        httpCode: HttpStatus.OK,
        type: ReorderHostsResponseDto,
    })
    async reorderHosts(@Body() body: ReorderHostsBodyDto): Promise<ReorderHostsResponseDto> {
        const result = await this.hostsService.reorderHosts(body);

        const data = errorHandler(result);
        return {
            response: {
                isUpdated: data.isUpdated,
            },
        };
    }

    @Endpoint({
        command: DeleteHostCommand,
        httpCode: HttpStatus.NO_CONTENT,
    })
    async deleteHost(@Param() params: DeleteHostParamDto) {
        const result = await this.hostsService.deleteHost(params.uuid);

        errorHandler(result);
        await this.hostsService.synchronizeCommittedPolicies();
        return;
    }
}

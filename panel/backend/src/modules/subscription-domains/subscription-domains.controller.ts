import { createZodDto } from 'nestjs-zod';

import {
    Body,
    Controller,
    Header,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeResource } from '@common/decorators/scopes';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ScopesGuard } from '@common/guards/scopes';
import { CONTROLLERS_INFO } from '@libs/contracts/api';
import {
    GetSubscriptionDomainCredentialsCommand,
    ListSubscriptionDomainsCommand,
    GetSubscriptionDomainCommand,
    CreateSubscriptionDomainCommand,
    UpdateSubscriptionDomainCommand,
    DeleteSubscriptionDomainCommand,
} from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import { SubscriptionDomainsService } from './subscription-domains.service';
export class SubscriptionDomainCredentialsResponseDto extends createZodDto(
    GetSubscriptionDomainCredentialsCommand.ResponseSchema,
) {}
export class SubscriptionDomainBodyDto extends createZodDto(
    CreateSubscriptionDomainCommand.RequestBodySchema,
) {}
export class SubscriptionDomainResponseDto extends createZodDto(
    GetSubscriptionDomainCommand.ResponseSchema,
) {}
export class SubscriptionDomainsResponseDto extends createZodDto(
    ListSubscriptionDomainsCommand.ResponseSchema,
) {}
export class SubscriptionDomainsQueryDto extends createZodDto(
    ListSubscriptionDomainsCommand.RequestQuerySchema,
) {}
export class DeleteSubscriptionDomainQueryDto extends createZodDto(
    DeleteSubscriptionDomainCommand.RequestQuerySchema,
) {}
@ApiBearerAuth('Authorization')
@ApiTags(CONTROLLERS_INFO.SUBSCRIPTION_DOMAINS.tag)
@ApiScopeResource(CONTROLLERS_INFO.SUBSCRIPTION_DOMAINS.resource)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@Controller('subscription-domains')
export class SubscriptionDomainsController {
    constructor(private readonly service: SubscriptionDomainsService) {}
    @Header('Cache-Control', 'no-store')
    @Endpoint({
        command: GetSubscriptionDomainCredentialsCommand,
        httpCode: HttpStatus.OK,
        type: SubscriptionDomainCredentialsResponseDto,
    })
    async credentials(@Param('uuid', new ParseUUIDPipe()) uuid: string) {
        return { response: await this.service.credentials(uuid) };
    }
    @Header('Cache-Control', 'no-store')
    @Endpoint({
        command: ListSubscriptionDomainsCommand,
        httpCode: HttpStatus.OK,
        type: SubscriptionDomainsResponseDto,
    })
    async list(@Query() query: SubscriptionDomainsQueryDto) {
        return this.service.listing(query);
    }
    @Header('Cache-Control', 'no-store')
    @Endpoint({
        command: GetSubscriptionDomainCommand,
        httpCode: HttpStatus.OK,
        type: SubscriptionDomainResponseDto,
    })
    async get(@Param('uuid', new ParseUUIDPipe()) uuid: string) {
        return { response: await this.service.get(uuid) };
    }
    @Header('Cache-Control', 'no-store')
    @Endpoint({
        command: CreateSubscriptionDomainCommand,
        httpCode: HttpStatus.CREATED,
        type: SubscriptionDomainResponseDto,
    })
    async create(@Body() body: SubscriptionDomainBodyDto) {
        return { response: await this.service.save(undefined, body) };
    }
    @Header('Cache-Control', 'no-store')
    @Endpoint({
        command: UpdateSubscriptionDomainCommand,
        httpCode: HttpStatus.OK,
        type: SubscriptionDomainResponseDto,
    })
    async update(
        @Param('uuid', new ParseUUIDPipe()) uuid: string,
        @Body() body: SubscriptionDomainBodyDto,
    ) {
        return { response: await this.service.save(uuid, body) };
    }
    @Header('Cache-Control', 'no-store')
    @Endpoint({ command: DeleteSubscriptionDomainCommand, httpCode: HttpStatus.NO_CONTENT })
    async remove(
        @Param('uuid', new ParseUUIDPipe()) uuid: string,
        @Query() query: DeleteSubscriptionDomainQueryDto,
    ) {
        await this.service.remove(uuid, query);
    }
}

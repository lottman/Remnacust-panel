import { createZodDto } from 'nestjs-zod';

import { Controller, Header, HttpStatus, Param, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeResource } from '@common/decorators/scopes';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ScopesGuard } from '@common/guards/scopes';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { CONTROLLERS_INFO } from '@libs/contracts/api';
import {
    GetUserDomainLinksCommand,
    GetUserPrimaryDomainLinkCommand,
    GetUserCdnDomainLinksCommand,
} from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import { GetUserByUniqueFieldQuery } from '@modules/users/queries/get-user-by-unique-field';

import { SubscriptionDomainsService } from './subscription-domains.service';

export class UserDomainLinksParamsDto extends createZodDto(
    GetUserDomainLinksCommand.RequestParamSchema,
) {}
export class UserDomainLinksQueryDto extends createZodDto(
    GetUserDomainLinksCommand.RequestQuerySchema,
) {}
export class UserSingleDomainKindQueryDto extends createZodDto(
    GetUserPrimaryDomainLinkCommand.RequestQuerySchema,
) {}
export class UserDomainLinksResponseDto extends createZodDto(
    GetUserDomainLinksCommand.ResponseSchema,
) {}

@ApiBearerAuth('Authorization')
@ApiTags(CONTROLLERS_INFO.USERS.tag)
@ApiScopeResource(CONTROLLERS_INFO.USERS.resource)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@Controller('users')
export class UserDomainLinksController {
    constructor(
        private readonly queries: QueryBus,
        private readonly domains: SubscriptionDomainsService,
    ) {}

    private async links(userId: number, query: GetUserDomainLinksCommand.RequestQuery) {
        const result = await this.queries.execute(
            new GetUserByUniqueFieldQuery({ id: BigInt(userId) }, { activeInternalSquads: false }),
        );
        const user = errorHandler(result);
        return {
            response: await this.domains.userLinks(
                user.subscriptionDomainUuid,
                user.shortUuid,
                query,
            ),
        };
    }

    @Header('Cache-Control', 'private, no-store')
    @Endpoint({
        command: GetUserDomainLinksCommand,
        httpCode: HttpStatus.OK,
        type: UserDomainLinksResponseDto,
    })
    async all(@Param() params: UserDomainLinksParamsDto, @Query() query: UserDomainLinksQueryDto) {
        return this.links(params.userId, query);
    }

    @Header('Cache-Control', 'private, no-store')
    @Endpoint({
        command: GetUserPrimaryDomainLinkCommand,
        httpCode: HttpStatus.OK,
        type: UserDomainLinksResponseDto,
    })
    async primary(
        @Param() params: UserDomainLinksParamsDto,
        @Query() query: UserSingleDomainKindQueryDto,
    ) {
        return this.links(params.userId, { ...query, kind: 'PRIMARY' });
    }

    @Header('Cache-Control', 'private, no-store')
    @Endpoint({
        command: GetUserCdnDomainLinksCommand,
        httpCode: HttpStatus.OK,
        type: UserDomainLinksResponseDto,
    })
    async cdn(
        @Param() params: UserDomainLinksParamsDto,
        @Query() query: UserSingleDomainKindQueryDto,
    ) {
        return this.links(params.userId, { ...query, kind: 'CDN' });
    }
}

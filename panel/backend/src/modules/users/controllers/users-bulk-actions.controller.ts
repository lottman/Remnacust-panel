import { Body, Controller, HttpStatus, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TypedConfigService } from '@common/config/app-config';
import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeResource } from '@common/decorators/scopes';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ScopesGuard } from '@common/guards/scopes';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { CONTROLLERS_INFO, USERS_CONTROLLER } from '@libs/contracts/api';
import {
    BulkAllExtendExpirationDateCommand,
    BulkAllResetTrafficUsersCommand,
    BulkAllUpdateUsersCommand,
    BulkDeleteUsersByStatusCommand,
    BulkDeleteUsersCommand,
    BulkExtendExpirationDateCommand,
    BulkResetTrafficUsersCommand,
    BulkRevokeUsersSubscriptionCommand,
    BulkUpdateUsersCommand,
    BulkUpdateUsersSquadsCommand,
} from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import {
    BulkAllUpdateUsersBodyDto,
    BulkDeleteUsersByStatusBodyDto,
    BulkDeleteUsersBodyDto,
    BulkResetTrafficUsersBodyDto,
    BulkRevokeUsersSubscriptionBodyDto,
    BulkUpdateUsersSquadsBodyDto,
    BulkUpdateUsersBodyDto,
    BulkAllExtendExpirationDateBodyDto,
    BulkExtendExpirationDateBodyDto,
} from '../dtos';
import { UsersService } from '../users.service';

@ApiBearerAuth('Authorization')
@ApiScopeResource(CONTROLLERS_INFO.USERS_BULK_ACTIONS.resource)
@ApiTags(CONTROLLERS_INFO.USERS_BULK_ACTIONS.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(USERS_CONTROLLER)
export class UsersBulkActionsController {
    public readonly subPublicDomain: string;
    constructor(
        private readonly usersService: UsersService,
        private readonly configService: TypedConfigService,
    ) {
        this.subPublicDomain = this.configService.getOrThrow('SUB_PUBLIC_DOMAIN');
    }

    @Endpoint({
        command: BulkDeleteUsersByStatusCommand,
        httpCode: HttpStatus.ACCEPTED,
    })
    async bulkDeleteUsersByStatus(@Body() body: BulkDeleteUsersByStatusBodyDto) {
        const result = await this.usersService.bulkDeleteUsersByStatus(body);

        errorHandler(result);
        return;
    }

    @Endpoint({
        command: BulkDeleteUsersCommand,
        httpCode: HttpStatus.NO_CONTENT,
    })
    async bulkDeleteUsers(@Body() body: BulkDeleteUsersBodyDto) {
        const result = await this.usersService.bulkDeleteUsersByUserId(body.userIds);

        errorHandler(result);
        return;
    }

    @Endpoint({
        command: BulkRevokeUsersSubscriptionCommand,
        httpCode: HttpStatus.ACCEPTED,
    })
    async bulkRevokeUsersSubscription(@Body() body: BulkRevokeUsersSubscriptionBodyDto) {
        const result = await this.usersService.bulkRevokeUsersSubscription(body.userIds);

        errorHandler(result);
        return;
    }

    @Endpoint({
        command: BulkResetTrafficUsersCommand,
        httpCode: HttpStatus.ACCEPTED,
    })
    async bulkResetUserTraffic(@Body() body: BulkResetTrafficUsersBodyDto) {
        const result = await this.usersService.bulkResetUserTraffic(body.userIds);

        errorHandler(result);
        return;
    }

    @Endpoint({
        command: BulkUpdateUsersCommand,
        httpCode: HttpStatus.ACCEPTED,
    })
    async bulkUpdateUsers(@Body() body: BulkUpdateUsersBodyDto) {
        const result = await this.usersService.bulkUpdateUsers(body);

        errorHandler(result);
        return;
    }

    @Endpoint({
        command: BulkUpdateUsersSquadsCommand,
        httpCode: HttpStatus.NO_CONTENT,
    })
    async bulkUpdateUsersInternalSquads(@Body() body: BulkUpdateUsersSquadsBodyDto) {
        const result = await this.usersService.bulkUpdateUsersInternalSquads(
            body.userIds,
            body.activeInternalSquads,
        );

        errorHandler(result);
        return;
    }

    @Endpoint({
        command: BulkExtendExpirationDateCommand,
        httpCode: HttpStatus.NO_CONTENT,
    })
    async bulkExtendExpirationDate(@Body() body: BulkExtendExpirationDateBodyDto) {
        const result = await this.usersService.bulkExtendExpirationDate({
            userIds: body.userIds,
            extendDays: body.extendDays,
        });

        errorHandler(result);
        return;
    }

    @Endpoint({
        command: BulkAllUpdateUsersCommand,
        httpCode: HttpStatus.ACCEPTED,
    })
    async bulkUpdateAllUsers(@Body() body: BulkAllUpdateUsersBodyDto) {
        const result = await this.usersService.bulkUpdateAllUsers(body);

        errorHandler(result);
        return;
    }

    @Endpoint({
        command: BulkAllResetTrafficUsersCommand,
        httpCode: HttpStatus.ACCEPTED,
    })
    async bulkAllResetUserTraffic() {
        const result = await this.usersService.bulkAllResetUserTraffic();

        errorHandler(result);
        return;
    }

    @Endpoint({
        command: BulkAllExtendExpirationDateCommand,
        httpCode: HttpStatus.ACCEPTED,
    })
    async bulkAllExtendExpirationDate(@Body() body: BulkAllExtendExpirationDateBodyDto) {
        const result = await this.usersService.bulkAllExtendExpirationDate(body.extendDays);

        errorHandler(result);
        return;
    }
}

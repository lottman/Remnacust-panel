import { AdminOnlyEndpoint } from '@common/decorators/admin-only-endpoint';
import { Body, Controller, HttpStatus, Param, Query, UseFilters, UseGuards } from '@nestjs/common';
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
    CreateUserCommand,
    DeleteUserCommand,
    DisableUserCommand,
    EnableUserCommand,
    GetUsersTagsCommand,
    GetUsersCommand,
    GetUserAccessibleNodesCommand,
    GetUserByIdCommand,
    GetUserByShortUuidCommand,
    GetUserByUsernameCommand,
    GetUsersStreamCommand,
    GetUserSubscriptionRequestHistoryCommand,
    ResetUserTrafficCommand,
    ResolveUserCommand,
    RevokeUserSubscriptionCommand,
    ExtendUserCommand,
    UpdateUserCommand,
    ExportUsersCommand,
    ImportUsersCommand,
} from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import {
    CreateUserBodyDto,
    DeleteUserParamDto,
    DisableUserParamDto,
    EnableUserParamDto,
    GetUsersTagsResponseDto,
    GetUsersQueryDto,
    GetUserAccessibleNodesParamDto,
    GetUserAccessibleNodesResponseDto,
    GetUserByShortUuidParamDto,
    GetUserByUsernameParamDto,
    GetUsersStreamQueryDto,
    GetUsersStreamResponseDto,
    GetUserSubscriptionRequestHistoryParamDto,
    GetUserSubscriptionRequestHistoryResponseDto,
    ResetUserTrafficParamDto,
    ResolveUserBodyDto,
    ResolveUserResponseDto,
    RevokeUserSubscriptionBodyDto,
    RevokeUserSubscriptionParamDto,
    UpdateUserBodyDto,
    GetUsersResponseDto,
    GetUserByIdParamDto,
    UserResponseDto,
    ExtendUserBodyDto,
    ExtendUserParamDto,
    ExportUsersQueryDto,
    ExportUsersResponseDto,
    ImportUsersBodyDto,
    ImportUsersResponseDto,
} from '../dtos';
import {
    GetAllTagsResponseModel,
    GetAllUsersResponseModel,
    GetFullUserResponseModel,
    GetUsersStreamResponseModel,
} from '../models';
import { UsersService } from '../users.service';

@ApiBearerAuth('Authorization')
@ApiScopeResource(CONTROLLERS_INFO.USERS.resource)
@ApiTags(CONTROLLERS_INFO.USERS.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(USERS_CONTROLLER)
export class UsersController {
    public readonly subPublicDomain: string;
    constructor(
        private readonly usersService: UsersService,
        private readonly configService: TypedConfigService,
    ) {
        this.subPublicDomain = this.configService.getOrThrow('SUB_PUBLIC_DOMAIN');
    }

    @AdminOnlyEndpoint()
    @Endpoint({
        command: ExportUsersCommand,
        httpCode: HttpStatus.OK,
        type: ExportUsersResponseDto,
    })
    async exportUsers(@Query() query: ExportUsersQueryDto): Promise<ExportUsersResponseDto> {
        const result = await this.usersService.exportUsers(query.squadUuid);

        const data = errorHandler(result);
        return {
            response: {
                users: data as ExportUsersResponseDto['response']['users'],
                exportedAt: new Date().toISOString(),
            },
        };
    }

    @AdminOnlyEndpoint()
    @Endpoint({
        command: ImportUsersCommand,
        httpCode: HttpStatus.OK,
        type: ImportUsersResponseDto,
    })
    async importUsers(@Body() body: ImportUsersBodyDto): Promise<ImportUsersResponseDto> {
        const result = await this.usersService.importUsers(body);

        const data = errorHandler(result);
        return { response: data };
    }

    @Endpoint({
        command: CreateUserCommand,
        httpCode: HttpStatus.CREATED,
        type: UserResponseDto,
    })
    async createUser(@Body() body: CreateUserBodyDto): Promise<UserResponseDto> {
        const result = await this.usersService.createUser(body);

        const data = errorHandler(result);
        return {
            response: new GetFullUserResponseModel(data, this.subPublicDomain),
        };
    }

    @Endpoint({
        command: UpdateUserCommand,
        httpCode: HttpStatus.OK,
        type: UserResponseDto,
    })
    async updateUser(@Body() body: UpdateUserBodyDto): Promise<UserResponseDto> {
        const result = await this.usersService.updateUser(body);

        const data = errorHandler(result);
        return {
            response: new GetFullUserResponseModel(data, this.subPublicDomain),
        };
    }

    @Endpoint({
        command: DeleteUserCommand,
        httpCode: HttpStatus.NO_CONTENT,
    })
    async deleteUser(@Param() param: DeleteUserParamDto) {
        const result = await this.usersService.deleteUser(param.userId);

        errorHandler(result);
        return;
    }

    @Endpoint({
        command: GetUsersCommand,
        httpCode: HttpStatus.OK,
        type: GetUsersResponseDto,
    })
    async getUsers(@Query() query: GetUsersQueryDto): Promise<GetUsersResponseDto> {
        const { start, size, filters, filterModes, globalFilterMode, sorting } = query;

        const result = await this.usersService.getAllUsers({
            start,
            size,
            filters,
            filterModes,
            globalFilterMode,
            sorting,
        });

        const data = errorHandler(result);
        return {
            response: new GetAllUsersResponseModel({
                total: data.total,
                users: data.users.map(
                    (item) => new GetFullUserResponseModel(item, this.subPublicDomain),
                ),
            }),
        };
    }

    @Endpoint({
        command: GetUsersStreamCommand,
        httpCode: HttpStatus.OK,
        type: GetUsersStreamResponseDto,
    })
    async getUsersStream(
        @Query() query: GetUsersStreamQueryDto,
    ): Promise<GetUsersStreamResponseDto> {
        const result = await this.usersService.getUsersStream(query);

        const data = errorHandler(result);
        return {
            response: new GetUsersStreamResponseModel({
                users: data.users.map(
                    (item) => new GetFullUserResponseModel(item, this.subPublicDomain),
                ),
                nextCursor: data.nextCursor,
                hasMore: data.hasMore,
            }),
        };
    }

    @Endpoint({
        command: GetUsersTagsCommand,
        httpCode: HttpStatus.OK,
        type: GetUsersTagsResponseDto,
    })
    async getUsersTags(): Promise<GetUsersTagsResponseDto> {
        const result = await this.usersService.getAllTags();

        const data = errorHandler(result);
        return {
            response: new GetAllTagsResponseModel({
                tags: data,
            }),
        };
    }

    @Endpoint({
        command: GetUserAccessibleNodesCommand,
        httpCode: HttpStatus.OK,
        type: GetUserAccessibleNodesResponseDto,
    })
    async getUserAccessibleNodes(
        @Param() param: GetUserAccessibleNodesParamDto,
    ): Promise<GetUserAccessibleNodesResponseDto> {
        const result = await this.usersService.getUserAccessibleNodes(param.userId);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: GetUserSubscriptionRequestHistoryCommand,
        httpCode: HttpStatus.OK,
        type: GetUserSubscriptionRequestHistoryResponseDto,
    })
    async getUserSubscriptionRequestHistory(
        @Param() param: GetUserSubscriptionRequestHistoryParamDto,
    ): Promise<GetUserSubscriptionRequestHistoryResponseDto> {
        const result = await this.usersService.getUserSubscriptionRequestHistory(param.userId);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    /* get by methods




    */

    @Endpoint({
        command: GetUserByShortUuidCommand,
        httpCode: HttpStatus.OK,
        type: UserResponseDto,
    })
    async getUserByShortUuid(@Param() param: GetUserByShortUuidParamDto): Promise<UserResponseDto> {
        const result = await this.usersService.getUserByUniqueFields({
            shortUuid: param.shortUuid,
        });

        const data = errorHandler(result);
        return {
            response: new GetFullUserResponseModel(data, this.subPublicDomain),
        };
    }

    @Endpoint({
        command: GetUserByIdCommand,
        httpCode: HttpStatus.OK,
        type: UserResponseDto,
    })
    async getUserById(@Param() param: GetUserByIdParamDto): Promise<UserResponseDto> {
        const result = await this.usersService.getUserByUniqueFields({
            id: BigInt(param.userId),
        });

        const data = errorHandler(result);
        return {
            response: new GetFullUserResponseModel(data, this.subPublicDomain),
        };
    }

    @Endpoint({
        command: GetUserByUsernameCommand,
        httpCode: HttpStatus.OK,
        type: UserResponseDto,
    })
    async getUserByUsername(@Param() param: GetUserByUsernameParamDto): Promise<UserResponseDto> {
        const result = await this.usersService.getUserByUniqueFields({
            username: param.username,
        });

        const data = errorHandler(result);
        return {
            response: new GetFullUserResponseModel(data, this.subPublicDomain),
        };
    }

    /* actions methods


    */

    @Endpoint({
        command: RevokeUserSubscriptionCommand,
        httpCode: HttpStatus.OK,
        type: UserResponseDto,
    })
    async revokeUserSubscription(
        @Param() param: RevokeUserSubscriptionParamDto,
        @Body() body: RevokeUserSubscriptionBodyDto,
    ): Promise<UserResponseDto> {
        const result = await this.usersService.revokeUserSubscription(param.userId, body);

        const data = errorHandler(result);
        return {
            response: new GetFullUserResponseModel(data, this.subPublicDomain),
        };
    }

    @Endpoint({
        command: DisableUserCommand,
        httpCode: HttpStatus.OK,
        type: UserResponseDto,
    })
    async disableUser(@Param() param: DisableUserParamDto): Promise<UserResponseDto> {
        const result = await this.usersService.disableUser(param.userId);

        const data = errorHandler(result);
        return {
            response: new GetFullUserResponseModel(data, this.subPublicDomain),
        };
    }

    @Endpoint({
        command: EnableUserCommand,
        httpCode: HttpStatus.OK,
        type: UserResponseDto,
    })
    async enableUser(@Param() param: EnableUserParamDto): Promise<UserResponseDto> {
        const result = await this.usersService.enableUser(param.userId);

        const data = errorHandler(result);
        return {
            response: new GetFullUserResponseModel(data, this.subPublicDomain),
        };
    }

    @Endpoint({
        command: ResetUserTrafficCommand,
        httpCode: HttpStatus.OK,
        type: UserResponseDto,
    })
    async resetUserTraffic(@Param() param: ResetUserTrafficParamDto): Promise<UserResponseDto> {
        const result = await this.usersService.resetUserTraffic(param.userId);

        const data = errorHandler(result);
        return {
            response: new GetFullUserResponseModel(data, this.subPublicDomain),
        };
    }

    @Endpoint({
        command: ExtendUserCommand,
        httpCode: HttpStatus.OK,
        type: UserResponseDto,
    })
    async extendUserExpirationDate(
        @Param() param: ExtendUserParamDto,
        @Body() body: ExtendUserBodyDto,
    ): Promise<UserResponseDto> {
        const result = await this.usersService.extendUserExpirationDate(param.userId, body.days);

        const data = errorHandler(result);
        return {
            response: new GetFullUserResponseModel(data, this.subPublicDomain),
        };
    }

    @Endpoint({
        command: ResolveUserCommand,
        httpCode: HttpStatus.OK,
        type: ResolveUserResponseDto,
    })
    async resolveUser(@Body() body: ResolveUserBodyDto): Promise<ResolveUserResponseDto> {
        const result = await this.usersService.resolveUser(body);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }
}

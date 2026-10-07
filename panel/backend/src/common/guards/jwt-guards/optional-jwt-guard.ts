import { ExecutionContext, Inject, Injectable, forwardRef } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { AuthGuard } from '@nestjs/passport';
import { TypedConfigService } from '@common/config/app-config/typed-config.service';
import { RawCacheService } from '@common/raw-cache';
import { isAdminSessionCurrent } from '@common/utils/admin-session';

import { TResult } from '@common/types';
import {
    REMNAWAVE_CLIENT_TYPE_BROWSER,
    REMNAWAVE_CLIENT_TYPE_HEADER,
    ROLE,
} from '@libs/contracts/constants';

import { AdminEntity } from '@modules/admin/entities/admin.entity';
import { GetAdminByUsernameQuery } from '@modules/admin/queries/get-admin-by-username';
import { IJWTAuthPayload } from '@modules/auth/interfaces';

@Injectable()
export class OptionalJwtGuard extends AuthGuard('registeredUserJWT') {
    constructor(
        private readonly queryBus: QueryBus,
        @Inject(forwardRef(() => TypedConfigService)) private readonly config: TypedConfigService,
        private readonly cache: RawCacheService,
    ) {
        super();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    handleRequest(err: any, user: any, info: any, context: any) {
        return user;
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isJwtValid = await super.canActivate(context);

        if (!isJwtValid) {
            return true;
        }

        const request = context.switchToHttp().getRequest<{
            user: IJWTAuthPayload;
            headers: any;
            authenticatedFromBrowser: boolean;
        }>();
        const { user, headers } = request;
        request.authenticatedFromBrowser = false;

        if (
            user?.role !== ROLE.ADMIN ||
            !user?.username ||
            headers[REMNAWAVE_CLIENT_TYPE_HEADER.toLowerCase()] !== REMNAWAVE_CLIENT_TYPE_BROWSER
        ) {
            return true;
        }

        const adminEntity = await this.getAdminByUsername({
            username: user.username,
            role: user.role,
        });

        const isValidAdmin = adminEntity.isOk && await isAdminSessionCurrent(
            user, adminEntity.response, this.config.getOrThrow('APP_SECRET'),
            key => this.cache.exists(key),
        );

        if (isValidAdmin) {
            request.authenticatedFromBrowser = true;
        }

        return true;
    }

    private async getAdminByUsername(dto: GetAdminByUsernameQuery): Promise<TResult<AdminEntity>> {
        return this.queryBus.execute<GetAdminByUsernameQuery, TResult<AdminEntity>>(
            new GetAdminByUsernameQuery(dto.username, dto.role),
        );
    }
}

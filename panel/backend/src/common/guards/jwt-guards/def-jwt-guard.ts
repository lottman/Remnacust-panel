import type { Request } from 'express';

import { verify } from 'jsonwebtoken';
import { ExtractJwt } from 'passport-jwt';

import {
    ExecutionContext,
    ForbiddenException,
    Inject,
    Injectable,
    UnauthorizedException,
    forwardRef,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { AuthGuard } from '@nestjs/passport';

import { TypedConfigService } from '@common/config/app-config/typed-config.service';
import { RawCacheService } from '@common/raw-cache';
import { TResult } from '@common/types';
import { hasValidJwtIdentity, isAdminSessionCurrent } from '@common/utils/admin-session';
import {
    REMNAWAVE_CLIENT_TYPE_BROWSER,
    REMNAWAVE_CLIENT_TYPE_HEADER,
    ROLE,
} from '@libs/contracts/constants';

import { AdminEntity } from '@modules/admin/entities/admin.entity';
import { GetAdminByUsernameQuery } from '@modules/admin/queries/get-admin-by-username';
import { ApiTokenEntity } from '@modules/api-tokens/entities/api-token.entity';
import { GetTokenByUuidQuery } from '@modules/api-tokens/queries/get-token-by-uuid';
import type { IJWTAuthPayload } from '@modules/auth/interfaces';

@Injectable()
export class JwtDefaultGuard extends AuthGuard('registeredUserJWT') {
    constructor(
        private readonly queryBus: QueryBus,
        @Inject(forwardRef(() => TypedConfigService)) private readonly config: TypedConfigService,
        private readonly cache: RawCacheService,
    ) {
        super();
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isJwtValid = await super.canActivate(context);
        if (!isJwtValid) {
            return false;
        }

        return this.authorizeRequest(context.switchToHttp().getRequest<Request>());
    }

    public async authenticateRequest(request: Request): Promise<void> {
        const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
        let payload: unknown;
        try {
            if (!token) throw new UnauthorizedException();
            payload = verify(token, this.config.getOrThrow('APP_SECRET'), {
                algorithms: ['HS256'],
            });
        } catch {
            throw new UnauthorizedException();
        }
        if (!hasValidJwtIdentity(payload)) throw new UnauthorizedException();
        request.user = payload as IJWTAuthPayload;
        if (!(await this.authorizeRequest(request))) throw new ForbiddenException();
    }

    private async authorizeRequest(request: Request): Promise<boolean> {
        const user = request.user as IJWTAuthPayload | undefined;

        if (!user || !user.role || !user.uuid) {
            return false;
        }

        switch (user.role) {
            case ROLE.API: {
                return await this.verifyApiToken(user, user.uuid);
            }

            case ROLE.ADMIN: {
                const headers = request.headers;

                const clientType = headers[REMNAWAVE_CLIENT_TYPE_HEADER.toLowerCase()];

                if (clientType !== REMNAWAVE_CLIENT_TYPE_BROWSER) {
                    throw new ForbiddenException(
                        'For API requests you must create own API-token in the admin dashboard.',
                    );
                }

                if (!user.username) {
                    throw new UnauthorizedException();
                }

                const adminEntity = await this.getAdminByUsername({
                    username: user.username,
                    role: user.role,
                });

                if (!adminEntity.isOk) {
                    throw new UnauthorizedException();
                }

                if (adminEntity.response.uuid !== user.uuid) {
                    throw new UnauthorizedException();
                }
                if (
                    !(await isAdminSessionCurrent(
                        user,
                        adminEntity.response,
                        this.config.getOrThrow('APP_SECRET'),
                        (key) => this.cache.exists(key),
                    ))
                ) {
                    throw new UnauthorizedException();
                }
                return true;
            }
            default:
                return false;
        }
    }

    private async getAdminByUsername(dto: GetAdminByUsernameQuery): Promise<TResult<AdminEntity>> {
        return this.queryBus.execute<GetAdminByUsernameQuery, TResult<AdminEntity>>(
            new GetAdminByUsernameQuery(dto.username, dto.role),
        );
    }

    private async getTokenByUuid(dto: GetTokenByUuidQuery): Promise<TResult<ApiTokenEntity>> {
        return this.queryBus.execute<GetTokenByUuidQuery, TResult<ApiTokenEntity>>(
            new GetTokenByUuidQuery(dto.uuid),
        );
    }

    private async verifyApiToken(user: IJWTAuthPayload, apiTokenUuid: string): Promise<boolean> {
        // Authorization must observe revocation and current scopes. A cache fill
        // racing a deletion can otherwise resurrect a token for the cache TTL.
        const token = await this.getTokenByUuid({ uuid: apiTokenUuid });
        if (!token.isOk) {
            return false;
        }
        const expiry = token.response.expireAt;
        if (
            expiry !== null &&
            (!(expiry instanceof Date) ||
                !Number.isFinite(expiry.getTime()) ||
                expiry <= new Date())
        ) {
            return false;
        }
        if (user.permanent === true && expiry !== null) {
            return false;
        }

        const scopes = token.response.scopes ?? [];

        user.scopes = scopes;
        return true;
    }
}

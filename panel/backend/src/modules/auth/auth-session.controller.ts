import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { Roles } from '@common/decorators/roles/roles';
import { GetJWTPayload } from '@common/decorators/get-jwt-payload';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { RawCacheService } from '@common/raw-cache';
import { adminSessionKey } from '@common/utils/admin-session';
import { ROLE } from '@libs/contracts/constants';
import { AUTH_CONTROLLER } from '@libs/contracts/api/controllers/auth';
import type { IJWTAuthPayload } from './interfaces';

@ApiExcludeController()
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard)
@Controller(AUTH_CONTROLLER)
export class AuthSessionController {
    constructor(private readonly cache: RawCacheService) {}

    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    async logout(@GetJWTPayload() payload: IJWTAuthPayload): Promise<void> {
        // Guard validates jti/exp and the current credentials before this handler.
        await this.cache.del(adminSessionKey(payload.jti!));
    }
}

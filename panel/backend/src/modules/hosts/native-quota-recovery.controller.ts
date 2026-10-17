import { ROLE } from '@contract/constants';
import { z } from 'zod';

import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    Param,
    Post,
    Query,
    UseFilters,
    UseGuards,
} from '@nestjs/common';

import { AdminOnlyEndpoint } from '@common/decorators/admin-only-endpoint';
import { GetJWTPayload } from '@common/decorators/get-jwt-payload/get-jwt-payload';
import { Roles } from '@common/decorators/roles/roles';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { HttpExceptionWithErrorCodeType } from '@common/exception/http-exeception-with-error-code.type';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles/roles.guard';
import { ScopesGuard } from '@common/guards/scopes';
import { LegacyRecoveryError } from '@common/host-policy/legacy-recovery-plan';
import { NativeQuotaRecoveryService } from '@common/host-policy/native-quota-recovery.service';
import {
    NativeRecoveryError,
    nativeRecoveryApproval,
    nativeRecoveryDraft,
} from '@common/host-policy/native-recovery-plan';
import { bankUuid, QuotaBankError } from '@common/host-policy/quota-bank-model';

@Controller('limits/quota-recovery/nodes/:uuid/native-import')
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
export class NativeQuotaRecoveryController {
    constructor(private readonly recovery: NativeQuotaRecoveryService) {}

    private async handle<T>(action: () => Promise<T>) {
        try {
            return { response: await action() };
        } catch (error) {
            if (error instanceof z.ZodError)
                throw new HttpExceptionWithErrorCodeType(
                    'Invalid native receipt import request',
                    'NATIVE_RECOVERY_INVALID_REQUEST',
                    400,
                );
            if (error instanceof NativeRecoveryError)
                throw new HttpExceptionWithErrorCodeType(
                    'Native receipt import cannot complete',
                    'NATIVE_RECOVERY_' + error.code,
                    error.code === 'SOURCE_MISSING'
                        ? 404
                        : error.code === 'SOURCE_INVALID'
                          ? 503
                          : 409,
                );
            if (error instanceof LegacyRecoveryError)
                throw new HttpExceptionWithErrorCodeType(
                    'Receipt allocation cannot complete',
                    'LEGACY_RECOVERY_' + error.code,
                    error.code === 'INVALID_ALLOCATION' ? 400 : 409,
                );
            if (error instanceof QuotaBankError)
                throw new HttpExceptionWithErrorCodeType(
                    'Bank verification cannot complete',
                    'QUOTA_BANK_' + error.code,
                    error.code === 'MISSING'
                        ? 404
                        : error.code === 'CORRUPT'
                          ? 503
                          : error.code === 'CAPACITY'
                            ? 413
                            : 409,
                );
            throw error;
        }
    }

    @AdminOnlyEndpoint()
    @Get(':request')
    @Header('Cache-Control', 'no-store')
    details(
        @Param('uuid') node: string,
        @Param('request') request: string,
        @Query() query: unknown,
    ) {
        return this.handle(() =>
            this.recovery.details(
                bankUuid.parse(node),
                bankUuid.parse(request),
                z.strictObject({ generation: bankUuid }).parse(query).generation,
            ),
        );
    }

    @AdminOnlyEndpoint()
    @Post('preview')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    preview(@Param('uuid') node: string, @Body() body: unknown) {
        return this.handle(() =>
            this.recovery.preview(bankUuid.parse(node), nativeRecoveryDraft.parse(body)),
        );
    }

    @AdminOnlyEndpoint()
    @Post('resolve')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    resolve(
        @Param('uuid') node: string,
        @Body() body: unknown,
        @GetJWTPayload() actor: { uuid: string },
    ) {
        return this.handle(() =>
            this.recovery.resolve(
                bankUuid.parse(node),
                nativeRecoveryApproval.parse(body),
                bankUuid.parse(actor.uuid),
            ),
        );
    }
}

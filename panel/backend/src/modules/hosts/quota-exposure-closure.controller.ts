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
import { NativeRecoveryError } from '@common/host-policy/native-recovery-plan';
import { bankUuid, QuotaBankError } from '@common/host-policy/quota-bank-model';
import {
    QuotaExposureClosureService,
    ExposureClosureError,
    exposureClosureDraft,
    exposureClosureApproval,
} from '@common/host-policy/quota-exposure-closure.service';
import { RecoveryReceiptDeliveryError } from '@common/host-policy/quota-recovery-receipt.service';

@Controller('limits/quota-recovery/nodes/:uuid/exposure-closures')
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
export class QuotaExposureClosureController {
    constructor(private readonly closures: QuotaExposureClosureService) {}
    private async handle<T>(action: () => Promise<T>) {
        try {
            return { response: await action() };
        } catch (error) {
            if (error instanceof z.ZodError)
                throw new HttpExceptionWithErrorCodeType(
                    'Invalid exposure closure request',
                    'RECOVERY_EXPOSURE_INVALID_REQUEST',
                    400,
                );
            if (
                error instanceof ExposureClosureError ||
                error instanceof RecoveryReceiptDeliveryError ||
                error instanceof NativeRecoveryError
            )
                throw new HttpExceptionWithErrorCodeType(
                    'Exposure closure cannot complete',
                    'RECOVERY_EXPOSURE_' + error.code,
                    error.code === 'NODE_MISSING' || error.code === 'SOURCE_MISSING'
                        ? 404
                        : error.code === 'NODE_UNAVAILABLE' || error.code === 'SOURCE_INVALID'
                          ? 503
                          : 409,
                );
            if (error instanceof QuotaBankError)
                throw new HttpExceptionWithErrorCodeType(
                    'Recovery bank cannot be verified',
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
    @Get()
    @Header('Cache-Control', 'no-store')
    list(@Param('uuid') node: string, @Query() query: unknown) {
        return this.handle(() => {
            const q = z
                .strictObject({ generation: bankUuid, after: bankUuid.optional() })
                .parse(query);
            return this.closures.list(bankUuid.parse(node), q.generation, q.after);
        });
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
            this.closures.details(
                bankUuid.parse(node),
                z.strictObject({ generation: bankUuid }).parse(query).generation,
                bankUuid.parse(request),
            ),
        );
    }
    @AdminOnlyEndpoint()
    @Post('preview')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    preview(@Param('uuid') node: string, @Body() body: unknown) {
        return this.handle(() =>
            this.closures.preview(bankUuid.parse(node), exposureClosureDraft.parse(body)),
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
            this.closures.resolve(
                bankUuid.parse(node),
                exposureClosureApproval.parse(body),
                bankUuid.parse(actor.uuid),
            ),
        );
    }
}

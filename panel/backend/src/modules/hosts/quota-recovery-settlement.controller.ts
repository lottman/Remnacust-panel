import { ROLE } from '@contract/constants';
import { z } from 'zod';

import {
    Body,
    Controller,
    Header,
    HttpCode,
    Param,
    Post,
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
import { bankUuid, QuotaBankError } from '@common/host-policy/quota-bank-model';
import {
    RecoverySettlementError,
    settlementApproval,
    settlementDraft,
} from '@common/host-policy/quota-recovery-settlement-plan';
import { QuotaRecoverySettlementService } from '@common/host-policy/quota-recovery-settlement.service';

@Controller('limits/quota-recovery/nodes/:uuid/settlements')
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
export class QuotaRecoverySettlementController {
    constructor(private readonly recovery: QuotaRecoverySettlementService) {}

    private async handle<T>(action: () => Promise<T>) {
        try {
            return { response: await action() };
        } catch (error) {
            if (error instanceof z.ZodError)
                throw new HttpExceptionWithErrorCodeType(
                    'Invalid reserve settlement request',
                    'QUOTA_SETTLEMENT_INVALID_REQUEST',
                    400,
                );
            if (error instanceof RecoverySettlementError)
                throw new HttpExceptionWithErrorCodeType(
                    'Reserve settlement cannot complete',
                    'QUOTA_SETTLEMENT_' + error.code,
                    error.code === 'SOURCE_MISSING'
                        ? 404
                        : error.code === 'SOURCE_INVALID'
                          ? 503
                          : 409,
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
    @Post('preview')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    preview(@Param('uuid') node: string, @Body() body: unknown) {
        return this.handle(() =>
            this.recovery.preview(bankUuid.parse(node), settlementDraft.parse(body)),
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
                settlementApproval.parse(body),
                bankUuid.parse(actor.uuid),
            ),
        );
    }
}

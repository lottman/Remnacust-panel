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
import { LegacyQueueRecoveryService } from '@common/host-policy/legacy-queue-recovery.service';
import { LegacyQuotaRecoveryService } from '@common/host-policy/legacy-quota-recovery.service';
import {
    legacyReceipt,
    legacyQueueCapture,
    legacyRecoveryApproval,
    legacyRecoveryDraft,
    LegacyRecoveryError,
} from '@common/host-policy/legacy-recovery-plan';

@Controller('limits/quota-recovery/legacy-jobs')
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
export class LegacyQuotaRecoveryController {
    constructor(
        private readonly recovery: LegacyQuotaRecoveryService,
        private readonly queue: LegacyQueueRecoveryService,
    ) {}

    private async handle<T>(action: () => Promise<T>) {
        try {
            return { response: await action() };
        } catch (error) {
            if (error instanceof z.ZodError)
                throw new HttpExceptionWithErrorCodeType(
                    'Invalid recovery decision',
                    'LEGACY_RECOVERY_INVALID_REQUEST',
                    400,
                );
            if (error instanceof LegacyRecoveryError)
                throw new HttpExceptionWithErrorCodeType(
                    'The recovery decision cannot be applied',
                    'LEGACY_RECOVERY_' + error.code,
                    error.code === 'SOURCE_MISSING'
                        ? 404
                        : error.code === 'DECISION_CORRUPT' || error.code === 'QUEUE_UNAVAILABLE'
                          ? 503
                          : 409,
                );
            throw error;
        }
    }
    @AdminOnlyEndpoint()
    @Post('capture-failed')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    capture(@Body() body: unknown) {
        return this.handle(() => this.queue.capture(legacyQueueCapture.parse(body)));
    }

    @AdminOnlyEndpoint()
    @Get()
    @Header('Cache-Control', 'no-store')
    list(@Query() query: unknown) {
        return this.handle(() =>
            this.recovery.list(
                z.strictObject({ after: legacyReceipt.optional() }).parse(query).after,
            ),
        );
    }
    @AdminOnlyEndpoint()
    @Get('targets')
    @Header('Cache-Control', 'no-store')
    targets(@Query() query: unknown) {
        return this.handle(() =>
            this.recovery.searchTargets(
                z.strictObject({ search: z.string().trim().max(100).default('') }).parse(query)
                    .search,
            ),
        );
    }
    @AdminOnlyEndpoint()
    @Get(':receipt')
    @Header('Cache-Control', 'no-store')
    details(@Param('receipt') receipt: string) {
        return this.handle(() => this.recovery.details(legacyReceipt.parse(receipt)));
    }
    @AdminOnlyEndpoint()
    @Post(':receipt/preview')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    preview(@Param('receipt') receipt: string, @Body() body: unknown) {
        return this.handle(() =>
            this.recovery.preview(legacyReceipt.parse(receipt), legacyRecoveryDraft.parse(body)),
        );
    }
    @AdminOnlyEndpoint()
    @Post(':receipt/resolve')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    resolve(
        @Param('receipt') receipt: string,
        @Body() body: unknown,
        @GetJWTPayload() actor: { uuid: string },
    ) {
        return this.handle(() =>
            this.recovery.resolve(
                legacyReceipt.parse(receipt),
                legacyRecoveryApproval.parse(body),
                z.uuid().parse(actor.uuid),
            ),
        );
    }
}

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
import { QuotaBankError } from '@common/host-policy/quota-bank-model';
import {
    QuotaRecoveryFinalizationService,
    RecoveryFinalizationError,
    recoveryFinalizationRequest,
} from '@common/host-policy/quota-recovery-finalization.service';
import {
    QuotaRecoveryReleaseService,
    RecoveryReleaseError,
    releaseDraft,
    releaseApproval,
} from '@common/host-policy/quota-recovery-release.service';
import {
    QuotaReleaseDeliveryService,
    ReleaseDeliveryError,
} from '@common/host-policy/quota-release-delivery.service';

const uuid = z
    .uuid()
    .refine(
        (value) =>
            value === value.toLowerCase() && value !== '00000000-0000-0000-0000-000000000000',
    );
@Controller('limits/quota-recovery/releases')
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
export class QuotaRecoveryReleaseController {
    constructor(
        private readonly releases: QuotaRecoveryReleaseService,
        private readonly deliveries: QuotaReleaseDeliveryService,
        private readonly finalizations: QuotaRecoveryFinalizationService,
    ) {}
    private async handle<T>(action: () => Promise<T>) {
        try {
            return { response: await action() };
        } catch (error) {
            if (error instanceof z.ZodError)
                throw new HttpExceptionWithErrorCodeType(
                    'Invalid recovery release request',
                    'RECOVERY_RELEASE_INVALID_REQUEST',
                    400,
                );
            if (
                error instanceof RecoveryReleaseError ||
                error instanceof ReleaseDeliveryError ||
                error instanceof RecoveryFinalizationError
            )
                throw new HttpExceptionWithErrorCodeType(
                    'Recovery release cannot complete',
                    'RECOVERY_RELEASE_' + error.code,
                    ['APPROVAL_MISSING', 'JOB_MISSING'].includes(error.code)
                        ? 404
                        : ['NODE_UNAVAILABLE', 'INVALID_ACK'].includes(error.code)
                          ? 503
                          : 409,
                );
            if (error instanceof QuotaBankError)
                throw new HttpExceptionWithErrorCodeType(
                    'Recovery bank cannot be verified',
                    'QUOTA_BANK_' + error.code,
                    error.code === 'MISSING' ? 404 : error.code === 'CORRUPT' ? 503 : 409,
                );
            throw error;
        }
    }
    private async scopedJob(approval: string, request: string, after?: string) {
        const job = await this.deliveries.details(uuid.parse(request), after);
        if (job.approval !== uuid.parse(approval)) throw new ReleaseDeliveryError('JOB_MISSING');
        return job;
    }
    @AdminOnlyEndpoint()
    @Get()
    @Header('Cache-Control', 'no-store')
    status(@Query() query: unknown) {
        return this.handle(() =>
            this.releases.status(z.strictObject({ generation: uuid }).parse(query).generation),
        );
    }
    @AdminOnlyEndpoint()
    @Post('preview')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    preview(@Body() body: unknown, @GetJWTPayload() actor: { uuid: string }) {
        return this.handle(() =>
            this.releases.preview(releaseDraft.parse(body), uuid.parse(actor.uuid)),
        );
    }
    @AdminOnlyEndpoint()
    @Post('approve')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    approve(@Body() body: unknown, @GetJWTPayload() actor: { uuid: string }) {
        return this.handle(() =>
            this.releases.approve(releaseApproval.parse(body), uuid.parse(actor.uuid)),
        );
    }
    @AdminOnlyEndpoint()
    @Get(':approval/jobs')
    @Header('Cache-Control', 'no-store')
    jobs(@Param('approval') approval: string, @Query() query: unknown) {
        return this.handle(() =>
            this.deliveries.list(
                uuid.parse(approval),
                z.strictObject({ after: uuid.optional() }).parse(query).after,
            ),
        );
    }
    @AdminOnlyEndpoint()
    @Get(':approval/jobs/:request')
    @Header('Cache-Control', 'no-store')
    job(
        @Param('approval') approval: string,
        @Param('request') request: string,
        @Query() query: unknown,
    ) {
        return this.handle(() =>
            this.scopedJob(
                approval,
                request,
                z.strictObject({ after: uuid.optional() }).parse(query).after,
            ),
        );
    }
    @AdminOnlyEndpoint()
    @Post(':approval/jobs/:request/deliver')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    deliver(
        @Param('approval') approval: string,
        @Param('request') request: string,
        @Body() body: unknown,
        @GetJWTPayload() actor: { uuid: string },
    ) {
        return this.handle(async () => {
            z.strictObject({}).parse(body);
            await this.scopedJob(approval, request);
            return this.deliveries.deliver(uuid.parse(request), uuid.parse(actor.uuid));
        });
    }
    @AdminOnlyEndpoint()
    @Post(':approval/finalizations')
    @HttpCode(202)
    @Header('Cache-Control', 'no-store')
    finalize(
        @Param('approval') approval: string,
        @Body() body: unknown,
        @GetJWTPayload() actor: { uuid: string },
    ) {
        return this.handle(() => {
            const input = recoveryFinalizationRequest.omit({ approvalRequest: true }).parse(body);
            return this.finalizations.enqueue(
                { ...input, approvalRequest: uuid.parse(approval) },
                uuid.parse(actor.uuid),
            );
        });
    }
    @AdminOnlyEndpoint()
    @Get(':approval/finalizations/:request')
    @Header('Cache-Control', 'no-store')
    finalization(
        @Param('approval') approval: string,
        @Param('request') request: string,
        @Query() query: unknown,
    ) {
        return this.handle(async () => {
            uuid.parse(approval);
            const result = await this.finalizations.details(
                uuid.parse(request),
                z.strictObject({ after: uuid.optional() }).parse(query).after,
            );
            if (result.approvalRequest !== approval)
                throw new RecoveryFinalizationError('APPROVAL_MISSING');
            return result;
        });
    }
}

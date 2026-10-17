import { ROLE } from '@contract/constants';
import { z } from 'zod';

import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    Param,
    ParseUUIDPipe,
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
import {
    QuotaRecoveryReceiptService,
    RecoveryReceiptDeliveryError,
} from '@common/host-policy/quota-recovery-receipt.service';

@Controller('limits/quota-recovery/nodes/:uuid/receipt-ack')
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
export class QuotaRecoveryReceiptController {
    constructor(private readonly receipts: QuotaRecoveryReceiptService) {}
    private async handle<T>(action: () => Promise<T>) {
        try {
            return { response: await action() };
        } catch (error) {
            if (error instanceof z.ZodError)
                throw new HttpExceptionWithErrorCodeType(
                    'Invalid recovery receipt request',
                    'RECOVERY_RECEIPT_INVALID_REQUEST',
                    400,
                );
            if (
                error instanceof RecoveryReceiptDeliveryError ||
                error instanceof NativeRecoveryError
            )
                throw new HttpExceptionWithErrorCodeType(
                    'Recovery receipt delivery cannot complete',
                    'RECOVERY_RECEIPT_' + error.code,
                    error.code === 'NODE_MISSING' ||
                        error.code === 'JOB_MISSING' ||
                        error.code === 'SOURCE_MISSING'
                        ? 404
                        : error.code === 'NODE_UNAVAILABLE' || error.code === 'SOURCE_INVALID'
                          ? 503
                          : 409,
                );
            throw error;
        }
    }
    @AdminOnlyEndpoint()
    @Get()
    @Header('Cache-Control', 'no-store')
    list(@Param('uuid', new ParseUUIDPipe()) node: string, @Query() query: unknown) {
        return this.handle(() => {
            const request = z
                .strictObject({
                    generation: z.uuid(),
                    decisionRequest: z.uuid(),
                    after: z.uuid().optional(),
                })
                .parse(query);
            return this.receipts.list(
                node,
                request.generation,
                request.decisionRequest,
                request.after,
            );
        });
    }
    @AdminOnlyEndpoint()
    @Post()
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    deliver(
        @Param('uuid', new ParseUUIDPipe()) node: string,
        @Body() body: unknown,
        @GetJWTPayload() actor: { uuid: string },
    ) {
        return this.handle(() => {
            const request = z
                .strictObject({
                    generation: z.uuid(),
                    requestId: z.uuid(),
                    decisionRequest: z.uuid(),
                })
                .parse(body);
            return this.receipts.deliver(
                node,
                request.generation,
                z.uuid().parse(actor.uuid),
                request.requestId,
                request.decisionRequest,
            );
        });
    }
    @AdminOnlyEndpoint()
    @Get(':request')
    @Header('Cache-Control', 'no-store')
    details(
        @Param('uuid', new ParseUUIDPipe()) node: string,
        @Param('request', new ParseUUIDPipe()) request: string,
        @Query() query: unknown,
    ) {
        return this.handle(() =>
            this.receipts.details(
                node,
                request,
                z.strictObject({ after: z.uuid().optional() }).parse(query).after,
            ),
        );
    }
}

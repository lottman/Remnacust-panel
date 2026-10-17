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
import { QuotaReceiptRecoveryError } from '@common/host-policy/quota-receipt-recovery.service';
import {
    QuotaRecoveryTailService,
    RecoveryTailError,
} from '@common/host-policy/quota-recovery-tail.service';
import { recoveryTailInput } from '@common/host-policy/recovery-tail-plan';

@Controller('limits/quota-recovery/nodes/:uuid/receipt-ack/:ack/tail')
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
export class QuotaRecoveryTailController {
    constructor(private readonly tails: QuotaRecoveryTailService) {}
    private async handle<T>(action: () => Promise<T>) {
        try {
            return { response: await action() };
        } catch (error) {
            if (error instanceof z.ZodError)
                throw new HttpExceptionWithErrorCodeType(
                    'Invalid recovery tail request',
                    'RECOVERY_TAIL_INVALID_REQUEST',
                    400,
                );
            if (
                error instanceof RecoveryTailError ||
                error instanceof NativeRecoveryError ||
                error instanceof QuotaReceiptRecoveryError
            )
                throw new HttpExceptionWithErrorCodeType(
                    'Recovery tail cannot complete',
                    'RECOVERY_TAIL_' + error.code,
                    error.code === 'NODE_MISSING' || error.code === 'SOURCE_MISSING'
                        ? 404
                        : error.code === 'NODE_UNAVAILABLE' ||
                            error.code === 'SOURCE_INVALID' ||
                            error.code === 'SOURCE_CORRUPT'
                          ? 503
                          : 409,
                );
            throw error;
        }
    }
    @AdminOnlyEndpoint()
    @Get()
    @Header('Cache-Control', 'no-store')
    details(
        @Param('uuid', new ParseUUIDPipe()) node: string,
        @Param('ack', new ParseUUIDPipe()) ack: string,
        @Query() query: unknown,
    ) {
        return this.handle(() =>
            this.tails.details(
                node,
                ack,
                z.strictObject({ generation: z.uuid() }).parse(query).generation,
            ),
        );
    }
    @AdminOnlyEndpoint()
    @Post()
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    prepare(
        @Param('uuid', new ParseUUIDPipe()) node: string,
        @Param('ack', new ParseUUIDPipe()) ack: string,
        @Body() body: unknown,
        @GetJWTPayload() actor: { uuid: string },
    ) {
        return this.handle(() => {
            const request = recoveryTailInput.omit({ acknowledgementRequest: true }).parse(body);
            return this.tails.prepare(
                node,
                { ...request, acknowledgementRequest: ack },
                z.uuid().parse(actor.uuid),
            );
        });
    }
    @AdminOnlyEndpoint()
    @Post(':request/execute')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    execute(
        @Param('uuid', new ParseUUIDPipe()) node: string,
        @Param('ack', new ParseUUIDPipe()) ack: string,
        @Param('request', new ParseUUIDPipe()) request: string,
        @Body() body: unknown,
        @GetJWTPayload() actor: { uuid: string },
    ) {
        return this.handle(async () => {
            const { generation } = z.strictObject({ generation: z.uuid() }).parse(body);
            const saved = await this.tails.details(node, ack, generation);
            if (saved.preparation?.request !== request || saved.sourceConflict)
                throw new RecoveryTailError('REQUEST_CONFLICT');
            return this.tails.execute(node, request, generation, z.uuid().parse(actor.uuid));
        });
    }
}

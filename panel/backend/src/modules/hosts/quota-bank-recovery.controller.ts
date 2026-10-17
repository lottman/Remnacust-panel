import { ROLE } from '@contract/constants';
import { Response } from 'express';
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
    Res,
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
import {
    bankCapture,
    bankDigest,
    bankUuid,
    QuotaBankError,
} from '@common/host-policy/quota-bank-model';
import { QuotaBankRecoveryService } from '@common/host-policy/quota-bank-recovery.service';

@Controller('limits/quota-recovery/bank-snapshots')
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
export class QuotaBankRecoveryController {
    constructor(private readonly recovery: QuotaBankRecoveryService) {}

    private async handle<T>(action: () => Promise<T>) {
        try {
            return { response: await action() };
        } catch (error) {
            if (error instanceof z.ZodError)
                throw new HttpExceptionWithErrorCodeType(
                    'Invalid bank recovery request',
                    'QUOTA_BANK_INVALID_REQUEST',
                    400,
                );
            if (error instanceof QuotaBankError)
                throw new HttpExceptionWithErrorCodeType(
                    'Bank recovery cannot complete',
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
    @Post('capture')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    capture(@Body() body: unknown, @GetJWTPayload() actor: { uuid: string }) {
        return this.handle(() => {
            const input = bankCapture.parse(body);
            return this.recovery.capture(
                input.generation,
                input.requestId,
                bankUuid.parse(actor.uuid),
            );
        });
    }
    @AdminOnlyEndpoint()
    @Get()
    @Header('Cache-Control', 'no-store')
    list(@Query() query: unknown) {
        return this.handle(() =>
            this.recovery.list(z.strictObject({ after: bankUuid.optional() }).parse(query).after),
        );
    }
    @AdminOnlyEndpoint()
    @Get(':request')
    @Header('Cache-Control', 'no-store')
    details(@Param('request') request: string) {
        return this.handle(() => this.recovery.details(bankUuid.parse(request)));
    }
    @AdminOnlyEndpoint()
    @Get(':request/parts')
    @Header('Cache-Control', 'no-store')
    parts(@Param('request') request: string, @Query() query: unknown) {
        return this.handle(() =>
            this.recovery.parts(
                bankUuid.parse(request),
                z
                    .strictObject({ after: z.coerce.number().int().min(0).max(99999).optional() })
                    .parse(query).after,
            ),
        );
    }
    @AdminOnlyEndpoint()
    @Get(':request/artifacts/:digest')
    @Header('Cache-Control', 'no-store')
    download(
        @Param('request') request: string,
        @Param('digest') digest: string,
        @Res() response: Response,
    ) {
        return this.handle(async () => {
            const file = await this.recovery.download(
                bankUuid.parse(request),
                bankDigest.parse(digest),
            );
            response.setHeader('Content-Type', 'application/gzip');
            response.setHeader('X-Content-Type-Options', 'nosniff');
            response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
            response.send(file.data);
        });
    }
    @AdminOnlyEndpoint()
    @Post(':request/compare')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    compare(@Param('request') request: string, @Body() body: unknown) {
        return this.handle(() =>
            this.recovery.compare(
                bankUuid.parse(request),
                z.strictObject({ generation: bankUuid }).parse(body).generation,
            ),
        );
    }
}

import type { Response } from 'express';

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
    QuotaReceiptRecoveryError,
    QuotaReceiptRecoveryService,
} from '@common/host-policy/quota-receipt-recovery.service';

@Controller('limits/quota-recovery/nodes/:uuid/receipts')
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
export class QuotaReceiptRecoveryController {
    constructor(private readonly receipts: QuotaReceiptRecoveryService) {}
    private async handle<T>(action: () => Promise<T>) {
        try {
            return { response: await action() };
        } catch (error) {
            if (error instanceof z.ZodError)
                throw new HttpExceptionWithErrorCodeType(
                    'Invalid usage archive request',
                    'QUOTA_RECEIPT_INVALID_REQUEST',
                    400,
                );
            if (error instanceof QuotaReceiptRecoveryError)
                throw new HttpExceptionWithErrorCodeType(
                    'Usage archive cannot be obtained',
                    'QUOTA_RECEIPT_' + error.code,
                    error.code === 'NODE_MISSING' || error.code === 'SOURCE_MISSING'
                        ? 404
                        : error.code === 'SOURCE_CORRUPT'
                          ? 503
                          : 409,
                );
            throw error;
        }
    }
    @AdminOnlyEndpoint()
    @Post()
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    capture(
        @Param('uuid', new ParseUUIDPipe()) node: string,
        @Body() body: unknown,
        @GetJWTPayload() actor: { uuid: string },
    ) {
        return this.handle(() =>
            this.receipts.capture(
                node,
                z.strictObject({ generation: z.uuid() }).parse(body).generation,
                z.uuid().parse(actor.uuid),
            ),
        );
    }
    @AdminOnlyEndpoint()
    @Get()
    @Header('Cache-Control', 'no-store')
    history(@Param('uuid', new ParseUUIDPipe()) node: string, @Query() query: unknown) {
        return this.handle(() =>
            this.receipts.history(
                node,
                z.strictObject({ after: z.uuid().optional() }).parse(query).after,
            ),
        );
    }
    @AdminOnlyEndpoint()
    @Get(':request/journal')
    @Header('Cache-Control', 'no-store')
    async download(
        @Param('uuid', new ParseUUIDPipe()) node: string,
        @Param('request', new ParseUUIDPipe()) request: string,
        @Res() response: Response,
    ) {
        const result = await this.handle(() => this.receipts.download(node, request));
        response.setHeader('Content-Type', 'application/gzip');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader(
            'Content-Disposition',
            `attachment; filename="${result.response.filename}"`,
        );
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.send(result.response.data);
    }
}

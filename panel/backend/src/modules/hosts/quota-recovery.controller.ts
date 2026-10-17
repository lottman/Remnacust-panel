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
    QuotaRecoveryError,
    QuotaRecoveryService,
} from '@common/host-policy/quota-recovery.service';

@Controller('limits/quota-recovery')
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
export class QuotaRecoveryController {
    constructor(private readonly recovery: QuotaRecoveryService) {}
    private async handle<T>(action: () => Promise<T>) {
        try {
            return { response: await action() };
        } catch (error) {
            if (error instanceof z.ZodError)
                throw new HttpExceptionWithErrorCodeType(
                    'Invalid quota recovery request',
                    'QUOTA_RECOVERY_INVALID_REQUEST',
                    400,
                );
            if (error instanceof QuotaRecoveryError)
                throw new HttpExceptionWithErrorCodeType(
                    'Quota recovery request cannot be completed',
                    'QUOTA_RECOVERY_' + error.code,
                    error.code === 'NODE_MISSING' || error.code === 'EVIDENCE_MISSING'
                        ? 404
                        : error.code === 'EVIDENCE_CORRUPT'
                          ? 503
                          : 409,
                );
            throw error;
        }
    }
    @AdminOnlyEndpoint()
    @Get('nodes/:uuid/history')
    @Header('Cache-Control', 'no-store')
    history(@Param('uuid', new ParseUUIDPipe()) node: string, @Query() query: unknown) {
        return this.handle(() => {
            const parsed = z
                .strictObject({ after: z.uuid().optional(), generation: z.uuid().optional() })
                .parse(query);
            return this.recovery.history(node, parsed.after, parsed.generation);
        });
    }
    @AdminOnlyEndpoint()
    @Get('nodes/:uuid/history/:request/parts')
    @Header('Cache-Control', 'no-store')
    parts(
        @Param('uuid', new ParseUUIDPipe()) node: string,
        @Param('request', new ParseUUIDPipe()) request: string,
        @Query() query: unknown,
    ) {
        return this.handle(() =>
            this.recovery.evidenceParts(
                node,
                request,
                z
                    .strictObject({ after: z.coerce.number().int().min(0).max(99999).optional() })
                    .parse(query).after,
            ),
        );
    }
    @AdminOnlyEndpoint()
    @Get('nodes/:uuid/history/:request/artifacts/:digest')
    @Header('Cache-Control', 'no-store')
    async artifact(
        @Param('uuid', new ParseUUIDPipe()) node: string,
        @Param('request', new ParseUUIDPipe()) request: string,
        @Param('digest') digest: string,
        @Res() response: Response,
    ) {
        const result = await this.handle(() =>
            this.recovery.evidenceArtifact(
                node,
                request,
                z
                    .string()
                    .regex(/^[a-f0-9]{64}$/)
                    .parse(digest),
            ),
        );
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Type', 'application/gzip');
        response.setHeader(
            'Content-Disposition',
            `attachment; filename="${result.response.filename}"`,
        );
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.send(result.response.data);
    }
    @AdminOnlyEndpoint()
    @Get()
    @Header('Cache-Control', 'no-store')
    status(@Query() query: unknown) {
        return this.handle(() =>
            this.recovery.status(z.strictObject({ after: z.uuid().optional() }).parse(query).after),
        );
    }
    @AdminOnlyEndpoint()
    @Post('nodes/:uuid/pause')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    pause(
        @Param('uuid', new ParseUUIDPipe()) node: string,
        @Body() body: unknown,
        @GetJWTPayload() actor: { uuid: string },
    ) {
        return this.handle(() =>
            this.recovery.pause(
                node,
                z.strictObject({ generation: z.uuid() }).parse(body).generation,
                z.uuid().parse(actor.uuid),
            ),
        );
    }
    @AdminOnlyEndpoint()
    @Post('nodes/:uuid/check')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    check(
        @Param('uuid', new ParseUUIDPipe()) node: string,
        @Body() body: unknown,
        @GetJWTPayload() actor: { uuid: string },
    ) {
        return this.handle(() =>
            this.recovery.check(
                node,
                z.strictObject({ generation: z.uuid() }).parse(body).generation,
                z.uuid().parse(actor.uuid),
            ),
        );
    }
}

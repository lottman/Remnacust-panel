import type { Response } from 'express';

import { z } from 'zod';

import {
    Body,
    Controller,
    Get,
    Post,
    UseGuards,
    BadRequestException,
    Header,
    HttpCode,
    Logger,
    Query,
    Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { AdminOnlyEndpoint } from '@common/decorators/admin-only-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ROLE } from '@libs/contracts/constants';

import { PanelUpdateService } from './panel-update.service';

const startSchema = z
    .object({
        targetVersion: z
            .string()
            .regex(/^\d+\.\d+\.\d+(?:\.\d+)?$/)
            .max(64),
        requestId: z.string().uuid(),
    })
    .strict();

@ApiExcludeController()
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard)
@Controller('system/update')
export class PanelUpdateController {
    private readonly logger = new Logger(PanelUpdateController.name);
    constructor(private readonly updates: PanelUpdateService) {}

    @AdminOnlyEndpoint()
    @Get('status')
    @Header('Cache-Control', 'no-store')
    async status() {
        return { response: await this.updates.status() };
    }

    @AdminOnlyEndpoint()
    @Get('log')
    async log(@Query() query: unknown, @Res() response: Response) {
        const parsed = z
            .object({
                jobId: z.string().uuid(),
                pageId: z
                    .string()
                    .regex(/^[a-f0-9]{24}$/)
                    .optional(),
            })
            .strict()
            .safeParse(query);
        if (!parsed.success) throw new BadRequestException('INVALID_LOG_REQUEST');
        const log = await this.updates.log(parsed.data.jobId, parsed.data.pageId);
        return response
            .status(200)
            .attachment(log.filename)
            .type('text/plain; charset=utf-8')
            .set('Cache-Control', 'no-store')
            .set('X-Content-Type-Options', 'nosniff')
            .send(log.content);
    }

    @AdminOnlyEndpoint()
    @Post('start')
    @HttpCode(202)
    @Header('Cache-Control', 'no-store')
    async start(@Body() body: unknown) {
        const parsed = startSchema.safeParse(body);
        if (!parsed.success) throw new BadRequestException('INVALID_UPDATE_REQUEST');
        const state = await this.updates.start(parsed.data);
        this.logger.log('Panel update requested: ' + state.jobId);
        return { response: state };
    }
}

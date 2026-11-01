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

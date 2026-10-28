import { z } from 'zod';

import {
    Body,
    Controller,
    Get,
    Post,
    UseGuards,
    Header,
    BadRequestException,
    HttpCode,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { AdminOnlyEndpoint } from '@common/decorators/admin-only-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ROLE } from '@libs/contracts/constants';

import { PanelUpdateService } from './panel-update.service';

const action = z
    .object({
        pageId: z.string().regex(/^[a-f0-9]{24}$/),
        operation: z.enum(['start', 'stop', 'restart', 'upgrade']),
        requestId: z.string().uuid(),
    })
    .strict();

@ApiExcludeController()
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard)
@Controller('system/subscription-pages')
export class SubscriptionPagesController {
    constructor(private readonly control: PanelUpdateService) {}

    @AdminOnlyEndpoint()
    @Get()
    @Header('Cache-Control', 'no-store')
    async list() {
        return { response: await this.control.subscriptionPages() };
    }

    @AdminOnlyEndpoint()
    @Post('action')
    @HttpCode(202)
    @Header('Cache-Control', 'no-store')
    async manage(@Body() body: unknown) {
        const parsed = action.safeParse(body);
        if (!parsed.success) throw new BadRequestException('INVALID_PAGE_ACTION');
        return { response: await this.control.subscriptionPageAction(parsed.data) };
    }
}

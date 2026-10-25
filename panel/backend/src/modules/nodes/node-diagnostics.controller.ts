import { ROLE } from '@contract/constants';
import { z } from 'zod';

import {
    BadRequestException,
    Body,
    Controller,
    Header,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Post,
    UseFilters,
    UseGuards,
} from '@nestjs/common';

import { AdminOnlyEndpoint } from '@common/decorators/admin-only-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles/roles.guard';
import { ScopesGuard } from '@common/guards/scopes';

import { NodeDiagnosticsService } from './node-diagnostics.service';

@Controller('nodes/:uuid/diagnostics')
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
export class NodeDiagnosticsController {
    constructor(private readonly diagnostics: NodeDiagnosticsService) {}
    @Post()
    @HttpCode(200)
    @Header('Cache-Control', 'private, no-store')
    @AdminOnlyEndpoint()
    async inspect(@Param('uuid', new ParseUUIDPipe()) uuid: string) {
        return { response: await this.diagnostics.inspect(uuid) };
    }
    @Post('notifications')
    @HttpCode(200)
    @AdminOnlyEndpoint()
    async notifications(@Param('uuid', new ParseUUIDPipe()) uuid: string, @Body() body: unknown) {
        const input = z
            .strictObject({ minutes: z.union([z.literal(0), z.literal(30), z.literal(60)]) })
            .safeParse(body);
        if (!input.success) throw new BadRequestException('Invalid notification pause');
        return { response: await this.diagnostics.mute(uuid, input.data.minutes) };
    }
}

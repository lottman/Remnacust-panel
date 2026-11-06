import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { AdminOnlyEndpoint } from '@common/decorators/admin-only-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ROLE } from '@libs/contracts/constants';

import { SystemDiagnosticsService } from './system-diagnostics.service';

@ApiExcludeController()
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard)
@Controller('system/diagnostics')
export class SystemDiagnosticsController {
    constructor(private readonly diagnostics: SystemDiagnosticsService) {}

    @AdminOnlyEndpoint()
    @Get()
    @Header('Cache-Control', 'no-store')
    async get() {
        return { response: await this.diagnostics.getSnapshot() };
    }
}

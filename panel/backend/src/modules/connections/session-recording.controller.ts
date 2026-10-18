import {
    Body,
    Controller,
    Delete,
    Get,
    Header,
    Param,
    Post,
    UseFilters,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Roles } from '@common/decorators/roles/roles';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ROLE } from '@libs/contracts/constants';

import { SessionRecordingService } from './session-recording.service';

// Subscription links are credentials. Only authenticated panel administrators may export them.
@Roles(ROLE.ADMIN)
@ApiBearerAuth('Authorization')
@ApiTags('Connections')
@UseGuards(JwtDefaultGuard, RolesGuard)
@UseFilters(HttpExceptionFilter)
@Controller('connections/recordings')
export class SessionRecordingController {
    constructor(private readonly recordings: SessionRecordingService) {}

    @Get()
    @Header('Cache-Control', 'no-store')
    async list() {
        return { response: await this.recordings.list() };
    }

    @Post()
    async start(@Body() body: unknown) {
        return { response: await this.recordings.start(body) };
    }

    @Post('users')
    @Header('Cache-Control', 'no-store')
    async users(@Body() body: { ids: number[] }) {
        return { response: await this.recordings.users(body?.ids) };
    }

    @Post(':id/stop')
    async stop(@Param('id') id: string) {
        return { response: await this.recordings.stop(id) };
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        return { response: await this.recordings.remove(id) };
    }

    @Get(':id/export')
    @Header('Cache-Control', 'no-store')
    @Header('Content-Disposition', 'attachment; filename="session-recording.json"')
    async export(@Param('id') id: string) {
        return { response: await this.recordings.export(id) };
    }
}

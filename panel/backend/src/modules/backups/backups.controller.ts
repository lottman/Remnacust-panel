import { BackupAccessService, BackupAccessGuard, BackupUnlockEndpoint, BACKUP_SESSION_HEADER, type BackupRequest } from './backup-access.service';
import { AdminOnlyEndpoint } from '@common/decorators/admin-only-endpoint';
import { getEndpointDetails } from '@libs/contracts/constants';
import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Param,
    Req,
    Post,
    StreamableFile,
    UseFilters,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeEndpoint, ApiScopeResource } from '@common/decorators/scopes';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ScopesGuard } from '@common/guards/scopes';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { CONTROLLERS_INFO, BACKUPS_CONTROLLER } from '@libs/contracts/api';
import {
    CreateBackupCommand,
    DeleteBackupCommand,
    GetBackupSettingsCommand,
    GetBackupsCommand,
    SendBackupCommand,
    UpdateBackupSettingsCommand,
} from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import { BackupsService } from './backups.service';
import {
    CreateBackupBodyDto,
    CreateBackupResponseDto,
    DeleteBackupBodyDto,
    DeleteBackupResponseDto,
    GetBackupSettingsResponseDto,
    GetBackupsResponseDto,
    SendBackupBodyDto,
    SendBackupResponseDto,
    UpdateBackupSettingsBodyDto,
    UpdateBackupSettingsResponseDto,
} from './dto/backups.dto';

@ApiBearerAuth('Authorization')
@ApiScopeResource(CONTROLLERS_INFO.BACKUPS.resource)
@ApiTags(CONTROLLERS_INFO.BACKUPS.tag)
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard, BackupAccessGuard)
@UseFilters(HttpExceptionFilter)
@Controller(BACKUPS_CONTROLLER)
export class BackupsController {
    constructor(private readonly backupsService: BackupsService, private readonly access: BackupAccessService) {}

    @AdminOnlyEndpoint()
    @BackupUnlockEndpoint()
    @Post('session/unlock')
    @HttpCode(HttpStatus.OK)
    @ApiScopeEndpoint(getEndpointDetails('session/unlock', 'post', 'Unlock backups for this page visit', { scope: 'session-unlock', kind: 'write' }))
    async unlock(@Req() request: BackupRequest, @Body() body: { password?: unknown }) {
        return { response: await this.access.unlock(request.user.uuid, body?.password, request.headers.authorization) };
    }

    @AdminOnlyEndpoint()
    @BackupUnlockEndpoint()
    @Post('session/lock')
    @HttpCode(HttpStatus.OK)
    @ApiScopeEndpoint(getEndpointDetails('session/lock', 'post', 'Lock backup page', { scope: 'session-lock', kind: 'write' }))
    async lock(@Req() request: BackupRequest) {
        await this.access.revoke(request.user.uuid, request.headers[BACKUP_SESSION_HEADER], request.headers.authorization);
        return { response: { locked: true } };
    }

    @AdminOnlyEndpoint()
    @Get('encryption')
    @ApiScopeEndpoint(getEndpointDetails('encryption', 'get', 'Check backup encryption status', { scope: 'encryption-status', kind: 'read' }))
    async encryptionStatus() {
        const status = await this.backupsService.encryptionStatus();
        return { response: { ...status, configured: true, automaticConfigured: status.configured } };
    }

    @AdminOnlyEndpoint()
    @Post('encryption/migrate')
    @HttpCode(HttpStatus.OK)
    @ApiScopeEndpoint(getEndpointDetails('encryption/migrate', 'post', 'Encrypt legacy backups', { scope: 'encryption-migrate', kind: 'write' }))
    async migrateLegacyBackups(@Req() request: BackupRequest) {
        return { response: await this.backupsService.migrateLegacy(request.backupPassword) };
    }

    @AdminOnlyEndpoint()
    @Get('download/:filename')
    @ApiScopeEndpoint(getEndpointDetails('download/:filename', 'get', 'Download a database backup', { scope: 'download', kind: 'read' }))
    async downloadBackup(@Param('filename') filename: string) {
        const stream = await this.backupsService.download(filename);
        if (!stream) throw new NotFoundException('Backup not found');
        return new StreamableFile(stream, {
            type: 'application/octet-stream',
            disposition: `attachment; filename="${filename}"`,
        });
    }

    @AdminOnlyEndpoint()
    @Endpoint({
        command: GetBackupsCommand,
        httpCode: HttpStatus.OK,
        type: GetBackupsResponseDto,
    })
    async getBackups(): Promise<GetBackupsResponseDto> {
        const result = await this.backupsService.list();
        const data = errorHandler(result);
        return { response: { backups: data } };
    }

    @AdminOnlyEndpoint()
    @Endpoint({
        command: CreateBackupCommand,
        httpCode: HttpStatus.OK,
        type: CreateBackupResponseDto,
    })
    async createBackup(@Body() body: CreateBackupBodyDto, @Req() request: BackupRequest): Promise<CreateBackupResponseDto> {
        void body;
        const result = await this.backupsService.create(false, request.backupPassword);
        const data = errorHandler(result);
        return { response: data };
    }

    @AdminOnlyEndpoint()
    @Endpoint({
        command: DeleteBackupCommand,
        httpCode: HttpStatus.OK,
        type: DeleteBackupResponseDto,
    })
    async deleteBackup(@Body() body: DeleteBackupBodyDto): Promise<DeleteBackupResponseDto> {
        const result = await this.backupsService.remove(body.filename);
        const data = errorHandler(result);
        return { response: { backups: data } };
    }

    @AdminOnlyEndpoint()
    @Endpoint({
        command: SendBackupCommand,
        httpCode: HttpStatus.OK,
        type: SendBackupResponseDto,
    })
    async sendBackup(@Body() body: SendBackupBodyDto): Promise<SendBackupResponseDto> {
        const result = await this.backupsService.send(body.filename);
        const data = errorHandler(result);
        return { response: data };
    }

    @AdminOnlyEndpoint()
    @Endpoint({
        command: GetBackupSettingsCommand,
        httpCode: HttpStatus.OK,
        type: GetBackupSettingsResponseDto,
    })
    async getSettings(): Promise<GetBackupSettingsResponseDto> {
        const result = await this.backupsService.getSettings();
        const data = errorHandler(result);
        return { response: data };
    }

    @AdminOnlyEndpoint()
    @Endpoint({
        command: UpdateBackupSettingsCommand,
        httpCode: HttpStatus.OK,
        type: UpdateBackupSettingsResponseDto,
    })
    async updateSettings(
        @Body() body: UpdateBackupSettingsBodyDto,
    ): Promise<UpdateBackupSettingsResponseDto> {
        const result = await this.backupsService.updateSettings(body);
        const data = errorHandler(result);
        return { response: data };
    }
}

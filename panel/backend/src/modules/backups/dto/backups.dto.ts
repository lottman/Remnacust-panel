import { createZodDto } from 'nestjs-zod';

import {
    CreateBackupCommand,
    DeleteBackupCommand,
    GetBackupSettingsCommand,
    GetBackupsCommand,
    SendBackupCommand,
    UpdateBackupSettingsCommand,
} from '@libs/contracts/commands';

export class GetBackupsResponseDto extends createZodDto(GetBackupsCommand.ResponseSchema) {}
export class CreateBackupBodyDto extends createZodDto(CreateBackupCommand.RequestBodySchema) {}
export class CreateBackupResponseDto extends createZodDto(CreateBackupCommand.ResponseSchema) {}
export class DeleteBackupBodyDto extends createZodDto(DeleteBackupCommand.RequestBodySchema) {}
export class DeleteBackupResponseDto extends createZodDto(DeleteBackupCommand.ResponseSchema) {}
export class SendBackupBodyDto extends createZodDto(SendBackupCommand.RequestBodySchema) {}
export class SendBackupResponseDto extends createZodDto(SendBackupCommand.ResponseSchema) {}
export class GetBackupSettingsResponseDto extends createZodDto(
    GetBackupSettingsCommand.ResponseSchema,
) {}
export class UpdateBackupSettingsBodyDto extends createZodDto(
    UpdateBackupSettingsCommand.RequestBodySchema,
) {}
export class UpdateBackupSettingsResponseDto extends createZodDto(
    UpdateBackupSettingsCommand.ResponseSchema,
) {}

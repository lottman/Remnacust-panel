import { createZodDto } from 'nestjs-zod';

import { ExportUsersCommand, ImportUsersCommand } from '@libs/contracts/commands';

export class ExportUsersQueryDto extends createZodDto(ExportUsersCommand.RequestQuerySchema) {}
export class ExportUsersResponseDto extends createZodDto(ExportUsersCommand.ResponseSchema) {}
export class ImportUsersBodyDto extends createZodDto(ImportUsersCommand.RequestBodySchema) {}
export class ImportUsersResponseDto extends createZodDto(ImportUsersCommand.ResponseSchema) {}

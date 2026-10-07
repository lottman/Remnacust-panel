import { createZodDto } from 'nestjs-zod';

import { GetConfigProfileRevisionsCommand } from '@libs/contracts/commands';

export class GetConfigProfileRevisionsParamDto extends createZodDto(
    GetConfigProfileRevisionsCommand.RequestParamSchema,
) {}
export class GetConfigProfileRevisionsResponseDto extends createZodDto(
    GetConfigProfileRevisionsCommand.ResponseSchema,
) {}

import { createZodDto } from 'nestjs-zod';

import { GetConfigProfileByUuidCommand } from '@libs/contracts/commands';

export class GetConfigProfileByUuidParamDto extends createZodDto(
    GetConfigProfileByUuidCommand.RequestParamSchema,
) {}
export class GetConfigProfileByUuidResponseDto extends createZodDto(
    GetConfigProfileByUuidCommand.ResponseSchema,
) {}

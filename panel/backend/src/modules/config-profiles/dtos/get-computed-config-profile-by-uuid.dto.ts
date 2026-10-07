import { createZodDto } from 'nestjs-zod';

import { GetComputedConfigProfileByUuidCommand } from '@libs/contracts/commands';

export class GetComputedConfigProfileByUuidParamDto extends createZodDto(
    GetComputedConfigProfileByUuidCommand.RequestParamSchema,
) {}
export class GetComputedConfigProfileByUuidResponseDto extends createZodDto(
    GetComputedConfigProfileByUuidCommand.ResponseSchema,
) {}

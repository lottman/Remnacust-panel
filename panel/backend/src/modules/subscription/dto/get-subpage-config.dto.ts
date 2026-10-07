import { createZodDto } from 'nestjs-zod';

import { GetSubpageConfigByShortUuidCommand } from '@libs/contracts/commands';

export class GetSubpageConfigByShortUuidParamDto extends createZodDto(
    GetSubpageConfigByShortUuidCommand.RequestParamSchema,
) {}
export class GetSubpageConfigByShortUuidResponseDto extends createZodDto(
    GetSubpageConfigByShortUuidCommand.ResponseSchema,
) {}

export class GetSubpageConfigByShortUuidBodyDto extends createZodDto(
    GetSubpageConfigByShortUuidCommand.RequestBodySchema,
) {}

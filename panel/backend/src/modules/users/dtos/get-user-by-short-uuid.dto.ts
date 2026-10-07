import { createZodDto } from 'nestjs-zod';

import { GetUserByShortUuidCommand } from '@libs/contracts/commands';

export class GetUserByShortUuidParamDto extends createZodDto(
    GetUserByShortUuidCommand.RequestParamSchema,
) {}

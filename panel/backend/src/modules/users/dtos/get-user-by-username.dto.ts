import { createZodDto } from 'nestjs-zod';

import { GetUserByUsernameCommand } from '@libs/contracts/commands';

export class GetUserByUsernameParamDto extends createZodDto(
    GetUserByUsernameCommand.RequestParamSchema,
) {}

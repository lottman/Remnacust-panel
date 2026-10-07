import { createZodDto } from 'nestjs-zod';

import { GetConfigProfilesCommand } from '@libs/contracts/commands';

export class GetConfigProfilesResponseDto extends createZodDto(
    GetConfigProfilesCommand.ResponseSchema,
) {}

import { createZodDto } from 'nestjs-zod';

import { ReorderConfigProfileCommand } from '@libs/contracts/commands';

export class ReorderConfigProfilesBodyDto extends createZodDto(
    ReorderConfigProfileCommand.RequestBodySchema,
) {}
export class ReorderConfigProfilesResponseDto extends createZodDto(
    ReorderConfigProfileCommand.ResponseSchema,
) {}

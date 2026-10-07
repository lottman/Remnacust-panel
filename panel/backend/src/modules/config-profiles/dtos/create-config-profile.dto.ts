import { createZodDto } from 'nestjs-zod';

import { CreateConfigProfileCommand } from '@libs/contracts/commands';

export class CreateConfigProfileBodyDto extends createZodDto(
    CreateConfigProfileCommand.RequestBodySchema,
) {}

export class CreateConfigProfileResponseDto extends createZodDto(
    CreateConfigProfileCommand.ResponseSchema,
) {}

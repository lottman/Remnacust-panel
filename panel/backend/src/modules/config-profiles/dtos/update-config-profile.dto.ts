import { createZodDto } from 'nestjs-zod';

import { UpdateConfigProfileCommand } from '@libs/contracts/commands';

export class UpdateConfigProfileBodyDto extends createZodDto(
    UpdateConfigProfileCommand.RequestBodySchema,
) {}

export class UpdateConfigProfileResponseDto extends createZodDto(
    UpdateConfigProfileCommand.ResponseSchema,
) {}

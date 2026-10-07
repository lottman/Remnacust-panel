import { createZodDto } from 'nestjs-zod';

import { CreateInternalSquadCommand } from '@libs/contracts/commands';

export class CreateInternalSquadBodyDto extends createZodDto(
    CreateInternalSquadCommand.RequestBodySchema,
) {}

export class CreateInternalSquadResponseDto extends createZodDto(
    CreateInternalSquadCommand.ResponseSchema,
) {}

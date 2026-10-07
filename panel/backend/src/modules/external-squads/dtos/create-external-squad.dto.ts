import { createZodDto } from 'nestjs-zod';

import { CreateExternalSquadCommand } from '@libs/contracts/commands';

export class CreateExternalSquadBodyDto extends createZodDto(
    CreateExternalSquadCommand.RequestBodySchema,
) {}

export class CreateExternalSquadResponseDto extends createZodDto(
    CreateExternalSquadCommand.ResponseSchema,
) {}

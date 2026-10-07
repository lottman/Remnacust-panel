import { createZodDto } from 'nestjs-zod';

import { UpdateExternalSquadCommand } from '@libs/contracts/commands';

export class UpdateExternalSquadBodyDto extends createZodDto(
    UpdateExternalSquadCommand.RequestBodySchema,
) {}

export class UpdateExternalSquadResponseDto extends createZodDto(
    UpdateExternalSquadCommand.ResponseSchema,
) {}

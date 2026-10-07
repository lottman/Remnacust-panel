import { createZodDto } from 'nestjs-zod';

import { UpdateInternalSquadCommand } from '@libs/contracts/commands';

export class UpdateInternalSquadBodyDto extends createZodDto(
    UpdateInternalSquadCommand.RequestBodySchema,
) {}

export class UpdateInternalSquadResponseDto extends createZodDto(
    UpdateInternalSquadCommand.ResponseSchema,
) {}

import { createZodDto } from 'nestjs-zod';

import { ReorderExternalSquadCommand } from '@libs/contracts/commands';

export class ReorderExternalSquadsBodyDto extends createZodDto(
    ReorderExternalSquadCommand.RequestBodySchema,
) {}
export class ReorderExternalSquadsResponseDto extends createZodDto(
    ReorderExternalSquadCommand.ResponseSchema,
) {}

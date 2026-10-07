import { createZodDto } from 'nestjs-zod';

import { ReorderInternalSquadCommand } from '@libs/contracts/commands';

export class ReorderInternalSquadsBodyDto extends createZodDto(
    ReorderInternalSquadCommand.RequestBodySchema,
) {}
export class ReorderInternalSquadsResponseDto extends createZodDto(
    ReorderInternalSquadCommand.ResponseSchema,
) {}

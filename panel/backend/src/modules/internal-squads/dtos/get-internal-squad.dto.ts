import { createZodDto } from 'nestjs-zod';

import { GetInternalSquadCommand } from '@libs/contracts/commands';

export class GetInternalSquadParamDto extends createZodDto(
    GetInternalSquadCommand.RequestParamSchema,
) {}

export class GetInternalSquadResponseDto extends createZodDto(
    GetInternalSquadCommand.ResponseSchema,
) {}

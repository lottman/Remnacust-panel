import { createZodDto } from 'nestjs-zod';

import { GetExternalSquadByUuidCommand } from '@libs/contracts/commands';

export class GetExternalSquadByUuidParamDto extends createZodDto(
    GetExternalSquadByUuidCommand.RequestParamSchema,
) {}

export class GetExternalSquadByUuidResponseDto extends createZodDto(
    GetExternalSquadByUuidCommand.ResponseSchema,
) {}

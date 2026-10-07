import { createZodDto } from 'nestjs-zod';

import { GetInternalSquadUsageCommand } from '@libs/contracts/commands';

export class GetInternalSquadUsageParamDto extends createZodDto(
    GetInternalSquadUsageCommand.RequestParamSchema,
) {}
export class GetInternalSquadUsageQueryDto extends createZodDto(
    GetInternalSquadUsageCommand.RequestQuerySchema,
) {}
export class GetInternalSquadUsageResponseDto extends createZodDto(
    GetInternalSquadUsageCommand.ResponseSchema,
) {}

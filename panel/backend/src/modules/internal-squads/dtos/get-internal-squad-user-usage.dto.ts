import { createZodDto } from 'nestjs-zod';

import { GetInternalSquadUserUsageCommand } from '@libs/contracts/commands';

export class GetInternalSquadUserUsageParamDto extends createZodDto(
    GetInternalSquadUserUsageCommand.RequestParamSchema,
) {}
export class GetInternalSquadUserUsageQueryDto extends createZodDto(
    GetInternalSquadUserUsageCommand.RequestQuerySchema,
) {}
export class GetInternalSquadUserUsageResponseDto extends createZodDto(
    GetInternalSquadUserUsageCommand.ResponseSchema,
) {}

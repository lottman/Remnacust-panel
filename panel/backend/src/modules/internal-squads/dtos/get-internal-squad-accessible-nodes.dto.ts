import { createZodDto } from 'nestjs-zod';

import { GetInternalSquadAccessibleNodesCommand } from '@libs/contracts/commands';

export class GetInternalSquadAccessibleNodesParamDto extends createZodDto(
    GetInternalSquadAccessibleNodesCommand.RequestParamSchema,
) {}
export class GetInternalSquadAccessibleNodesResponseDto extends createZodDto(
    GetInternalSquadAccessibleNodesCommand.ResponseSchema,
) {}

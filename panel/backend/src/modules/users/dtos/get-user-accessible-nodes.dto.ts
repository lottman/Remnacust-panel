import { createZodDto } from 'nestjs-zod';

import { GetUserAccessibleNodesCommand } from '@libs/contracts/commands';

export class GetUserAccessibleNodesParamDto extends createZodDto(
    GetUserAccessibleNodesCommand.RequestParamSchema,
) {}
export class GetUserAccessibleNodesResponseDto extends createZodDto(
    GetUserAccessibleNodesCommand.ResponseSchema,
) {}

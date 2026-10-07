import { createZodDto } from 'nestjs-zod';

import { GetInfraBillingNodesCommand } from '@libs/contracts/commands';

export class GetInfraBillingNodesResponseDto extends createZodDto(
    GetInfraBillingNodesCommand.ResponseSchema,
) {}

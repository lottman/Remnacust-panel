import { createZodDto } from 'nestjs-zod';

import { UpdateInfraBillingNodeCommand } from '@libs/contracts/commands';

export class UpdateInfraBillingNodeBodyDto extends createZodDto(
    UpdateInfraBillingNodeCommand.RequestBodySchema,
) {}

export class UpdateInfraBillingNodeResponseDto extends createZodDto(
    UpdateInfraBillingNodeCommand.ResponseSchema,
) {}

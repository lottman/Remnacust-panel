import { createZodDto } from 'nestjs-zod';

import { CreateInfraBillingNodeCommand } from '@libs/contracts/commands';

export class CreateInfraBillingNodeBodyDto extends createZodDto(
    CreateInfraBillingNodeCommand.RequestBodySchema,
) {}

export class CreateInfraBillingNodeResponseDto extends createZodDto(
    CreateInfraBillingNodeCommand.ResponseSchema,
) {}

import { createZodDto } from 'nestjs-zod';

import { CreateInfraBillingRecordCommand } from '@libs/contracts/commands';

export class CreateInfraBillingRecordBodyDto extends createZodDto(
    CreateInfraBillingRecordCommand.RequestBodySchema,
) {}

export class CreateInfraBillingRecordResponseDto extends createZodDto(
    CreateInfraBillingRecordCommand.ResponseSchema,
) {}

import { createZodDto } from 'nestjs-zod';

import { DeleteInfraBillingRecordCommand } from '@libs/contracts/commands';

export class DeleteInfraBillingRecordParamDto extends createZodDto(
    DeleteInfraBillingRecordCommand.RequestParamSchema,
) {}

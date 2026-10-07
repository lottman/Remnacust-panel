import { createZodDto } from 'nestjs-zod';

import { GetInfraBillingRecordsCommand } from '@libs/contracts/commands';

export class GetInfraBillingRecordsQueryDto extends createZodDto(
    GetInfraBillingRecordsCommand.RequestQuerySchema,
) {}

export class GetInfraBillingRecordsResponseDto extends createZodDto(
    GetInfraBillingRecordsCommand.ResponseSchema,
) {}

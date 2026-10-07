import { createZodDto } from 'nestjs-zod';

import { GetRawSubscriptionByShortUuidCommand } from '@libs/contracts/commands';

export class GetRawSubscriptionByShortUuidParamDto extends createZodDto(
    GetRawSubscriptionByShortUuidCommand.RequestParamSchema,
) {}

export class GetRawSubscriptionByShortUuidQueryDto extends createZodDto(
    GetRawSubscriptionByShortUuidCommand.RequestQuerySchema,
) {}

export class GetRawSubscriptionByShortUuidResponseDto extends createZodDto(
    GetRawSubscriptionByShortUuidCommand.ResponseSchema,
) {}

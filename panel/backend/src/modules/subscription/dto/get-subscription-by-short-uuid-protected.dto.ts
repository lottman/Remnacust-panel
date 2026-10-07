import { createZodDto } from 'nestjs-zod';

import { GetSubscriptionByShortUuidProtectedCommand } from '@libs/contracts/commands';

export class GetSubscriptionByShortUuidProtectedParamDto extends createZodDto(
    GetSubscriptionByShortUuidProtectedCommand.RequestParamSchema,
) {}

export class GetSubscriptionByShortUuidProtectedResponseDto extends createZodDto(
    GetSubscriptionByShortUuidProtectedCommand.ResponseSchema,
) {}

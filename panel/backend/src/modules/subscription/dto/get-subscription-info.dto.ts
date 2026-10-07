import { createZodDto } from 'nestjs-zod';

import { GetSubscriptionInfoByShortUuidCommand } from '@libs/contracts/commands/subscription';

export class GetSubscriptionInfoParamDto extends createZodDto(
    GetSubscriptionInfoByShortUuidCommand.RequestParamSchema,
) {}
export class GetSubscriptionInfoResponseDto extends createZodDto(
    GetSubscriptionInfoByShortUuidCommand.ResponseSchema,
) {}

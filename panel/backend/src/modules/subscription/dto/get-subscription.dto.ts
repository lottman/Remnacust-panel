import { createZodDto } from 'nestjs-zod';

import { GetSubscriptionByShortUuidCommand } from '@libs/contracts/commands/subscription';

export class GetSubscriptionByShortUuidParamDto extends createZodDto(
    GetSubscriptionByShortUuidCommand.RequestParamSchema,
) {}

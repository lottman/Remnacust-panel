import { createZodDto } from 'nestjs-zod';

import { GetSubscriptionByShortUuidByClientTypeCommand } from '@libs/contracts/commands';

export class GetSubscriptionByShortUuidByClientTypeParamDto extends createZodDto(
    GetSubscriptionByShortUuidByClientTypeCommand.RequestParamSchema,
) {}

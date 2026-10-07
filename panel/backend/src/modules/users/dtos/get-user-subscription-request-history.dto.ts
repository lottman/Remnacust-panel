import { createZodDto } from 'nestjs-zod';

import { GetUserSubscriptionRequestHistoryCommand } from '@libs/contracts/commands';

export class GetUserSubscriptionRequestHistoryParamDto extends createZodDto(
    GetUserSubscriptionRequestHistoryCommand.RequestParamSchema,
) {}
export class GetUserSubscriptionRequestHistoryResponseDto extends createZodDto(
    GetUserSubscriptionRequestHistoryCommand.ResponseSchema,
) {}

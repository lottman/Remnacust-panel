import { GetSubscriptionRequestHistoryCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetSubscriptionRequestHistoryQueryDto extends createZodDto(
    GetSubscriptionRequestHistoryCommand.RequestQuerySchema,
) {}

export class GetSubscriptionRequestHistoryResponseDto extends createZodDto(
    GetSubscriptionRequestHistoryCommand.ResponseSchema,
) {}

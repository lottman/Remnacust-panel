import { GetSubscriptionRequestHistoryStatsCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetSubscriptionRequestHistoryStatsResponseDto extends createZodDto(
    GetSubscriptionRequestHistoryStatsCommand.ResponseSchema,
) {}

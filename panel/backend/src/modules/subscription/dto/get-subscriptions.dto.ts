import { createZodDto } from 'nestjs-zod';

import { GetSubscriptionsCommand } from '@libs/contracts/commands/subscriptions';

export class GetSubscriptionsQueryDto extends createZodDto(
    GetSubscriptionsCommand.RequestQuerySchema,
) {}

export class GetSubscriptionsResponseDto extends createZodDto(
    GetSubscriptionsCommand.ResponseSchema,
) {}

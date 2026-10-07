import { createZodDto } from 'nestjs-zod';

import { GetSubscriptionByIdCommand } from '@libs/contracts/commands';

export class GetSubscriptionByIdParamDto extends createZodDto(
    GetSubscriptionByIdCommand.RequestParamSchema,
) {}

export class GetSubscriptionByIdResponseDto extends createZodDto(
    GetSubscriptionByIdCommand.ResponseSchema,
) {}

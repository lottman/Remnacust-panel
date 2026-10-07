import { createZodDto } from 'nestjs-zod';

import { GetSubscriptionByUsernameCommand } from '@libs/contracts/commands';

export class GetSubscriptionByUsernameParamDto extends createZodDto(
    GetSubscriptionByUsernameCommand.RequestParamSchema,
) {}

export class GetSubscriptionByUsernameResponseDto extends createZodDto(
    GetSubscriptionByUsernameCommand.ResponseSchema,
) {}

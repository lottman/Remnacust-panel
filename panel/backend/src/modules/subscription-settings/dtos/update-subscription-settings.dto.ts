import { createZodDto } from 'nestjs-zod';

import { UpdateSubscriptionSettingsCommand } from '@libs/contracts/commands';

export class UpdateSubscriptionSettingsBodyDto extends createZodDto(
    UpdateSubscriptionSettingsCommand.RequestBodySchema,
) {}

export class UpdateSubscriptionSettingsResponseDto extends createZodDto(
    UpdateSubscriptionSettingsCommand.ResponseSchema,
) {}

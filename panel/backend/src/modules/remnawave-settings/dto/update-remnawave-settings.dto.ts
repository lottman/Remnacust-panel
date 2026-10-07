import { createZodDto } from 'nestjs-zod';

import { UpdateRemnawaveSettingsCommand } from '@libs/contracts/commands';

export class UpdateRemnawaveSettingsBodyDto extends createZodDto(
    UpdateRemnawaveSettingsCommand.RequestBodySchema,
) {}

export class UpdateRemnawaveSettingsResponseDto extends createZodDto(
    UpdateRemnawaveSettingsCommand.ResponseSchema,
) {}

import { createZodDto } from 'nestjs-zod';

import { UpdateInfraProviderCommand } from '@libs/contracts/commands';

export class UpdateInfraProviderBodyDto extends createZodDto(
    UpdateInfraProviderCommand.RequestBodySchema,
) {}

export class UpdateInfraProviderResponseDto extends createZodDto(
    UpdateInfraProviderCommand.ResponseSchema,
) {}

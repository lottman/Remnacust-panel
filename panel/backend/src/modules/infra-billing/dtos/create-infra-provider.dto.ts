import { createZodDto } from 'nestjs-zod';

import { CreateInfraProviderCommand } from '@libs/contracts/commands';

export class CreateInfraProviderBodyDto extends createZodDto(
    CreateInfraProviderCommand.RequestBodySchema,
) {}

export class CreateInfraProviderResponseDto extends createZodDto(
    CreateInfraProviderCommand.ResponseSchema,
) {}

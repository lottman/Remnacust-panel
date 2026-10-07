import { createZodDto } from 'nestjs-zod';

import { GetInfraProviderCommand } from '@libs/contracts/commands';

export class GetInfraProviderParamDto extends createZodDto(
    GetInfraProviderCommand.RequestParamSchema,
) {}

export class GetInfraProviderResponseDto extends createZodDto(
    GetInfraProviderCommand.ResponseSchema,
) {}

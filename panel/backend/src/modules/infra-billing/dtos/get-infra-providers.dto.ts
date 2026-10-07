import { createZodDto } from 'nestjs-zod';

import { GetInfraProvidersCommand } from '@libs/contracts/commands';

export class GetInfraProvidersResponseDto extends createZodDto(
    GetInfraProvidersCommand.ResponseSchema,
) {}

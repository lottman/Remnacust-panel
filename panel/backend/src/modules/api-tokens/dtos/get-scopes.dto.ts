import { createZodDto } from 'nestjs-zod';

import { GetApiTokenScopesCommand } from '@libs/contracts/commands';

export class GetApiTokenScopesResponseDto extends createZodDto(
    GetApiTokenScopesCommand.ResponseSchema,
) {}

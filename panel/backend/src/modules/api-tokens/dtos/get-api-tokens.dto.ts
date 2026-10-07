import { createZodDto } from 'nestjs-zod';

import { GetApiTokensCommand } from '@libs/contracts/commands';

export class GetApiTokensResponseDto extends createZodDto(GetApiTokensCommand.ResponseSchema) {}

import { createZodDto } from 'nestjs-zod';

import { GetOttCommand } from '@libs/contracts/commands';

export class GetOttResponseDto extends createZodDto(GetOttCommand.ResponseSchema) {}

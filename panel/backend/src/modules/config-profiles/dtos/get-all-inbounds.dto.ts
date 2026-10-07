import { createZodDto } from 'nestjs-zod';

import { GetAllInboundsCommand } from '@libs/contracts/commands';

export class GetAllInboundsResponseDto extends createZodDto(GetAllInboundsCommand.ResponseSchema) {}

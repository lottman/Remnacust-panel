import { createZodDto } from 'nestjs-zod';

import { GetHostsCommand } from '@libs/contracts/commands';

export class GetHostsResponseDto extends createZodDto(GetHostsCommand.ResponseSchema) {}

import { createZodDto } from 'nestjs-zod';

import { ReorderHostsCommand } from '@libs/contracts/commands';

export class ReorderHostsBodyDto extends createZodDto(ReorderHostsCommand.RequestBodySchema) {}
export class ReorderHostsResponseDto extends createZodDto(ReorderHostsCommand.ResponseSchema) {}

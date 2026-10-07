import { createZodDto } from 'nestjs-zod';

import { DeleteHostCommand } from '@libs/contracts/commands';

export class DeleteHostParamDto extends createZodDto(DeleteHostCommand.RequestParamSchema) {}

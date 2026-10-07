import { createZodDto } from 'nestjs-zod';

import { EnableUserCommand } from '@libs/contracts/commands';

export class EnableUserParamDto extends createZodDto(EnableUserCommand.RequestParamSchema) {}

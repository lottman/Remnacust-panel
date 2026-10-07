import { createZodDto } from 'nestjs-zod';

import { DisableUserCommand } from '@libs/contracts/commands';

export class DisableUserParamDto extends createZodDto(DisableUserCommand.RequestParamSchema) {}

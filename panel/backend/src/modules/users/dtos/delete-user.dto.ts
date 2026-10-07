import { createZodDto } from 'nestjs-zod';

import { DeleteUserCommand } from '@libs/contracts/commands';

export class DeleteUserParamDto extends createZodDto(DeleteUserCommand.RequestParamSchema) {}

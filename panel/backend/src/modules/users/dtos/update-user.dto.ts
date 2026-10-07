import { createZodDto } from 'nestjs-zod';

import { UpdateUserCommand } from '@libs/contracts/commands';

export class UpdateUserBodyDto extends createZodDto(UpdateUserCommand.RequestBodySchema) {}

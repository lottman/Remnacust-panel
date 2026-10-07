import { createZodDto } from 'nestjs-zod';

import { CreateUserCommand } from '@libs/contracts/commands/users/create-user.command';

export class CreateUserBodyDto extends createZodDto(CreateUserCommand.RequestBodySchema) {}

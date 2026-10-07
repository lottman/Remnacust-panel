import { createZodDto } from 'nestjs-zod';

import { ResolveUserCommand } from '@libs/contracts/commands/users/resolve-user.command';

export class ResolveUserBodyDto extends createZodDto(ResolveUserCommand.RequestBodySchema) {}
export class ResolveUserResponseDto extends createZodDto(ResolveUserCommand.ResponseSchema) {}

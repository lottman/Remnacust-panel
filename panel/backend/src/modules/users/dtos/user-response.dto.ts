import { createZodDto } from 'nestjs-zod';

import { UserResponseSchema } from '@libs/contracts/commands/users/user.response';

export class UserResponseDto extends createZodDto(UserResponseSchema) {}

import { createZodDto } from 'nestjs-zod';

import { LoginCommand } from '@libs/contracts/commands';

export class LoginBodyDto extends createZodDto(LoginCommand.RequestBodySchema) {}
export class LoginResponseDto extends createZodDto(LoginCommand.ResponseSchema) {}

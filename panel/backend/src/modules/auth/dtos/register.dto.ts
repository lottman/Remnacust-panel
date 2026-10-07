import { createZodDto } from 'nestjs-zod';

import { RegisterCommand } from '@libs/contracts/commands';

export class RegisterBodyDto extends createZodDto(RegisterCommand.RequestBodySchema) {}
export class RegisterResponseDto extends createZodDto(RegisterCommand.ResponseSchema) {}

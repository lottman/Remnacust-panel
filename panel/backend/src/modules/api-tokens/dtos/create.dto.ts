import { createZodDto } from 'nestjs-zod';

import { CreateApiTokenCommand } from '@libs/contracts/commands';

export class CreateApiTokenBodyDto extends createZodDto(CreateApiTokenCommand.RequestBodySchema) {}
export class CreateApiTokenResponseDto extends createZodDto(CreateApiTokenCommand.ResponseSchema) {}

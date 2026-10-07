import { createZodDto } from 'nestjs-zod';

import { UpdatePasskeyCommand } from '@libs/contracts/commands';

export class UpdatePasskeyBodyDto extends createZodDto(UpdatePasskeyCommand.RequestBodySchema) {}
export class UpdatePasskeyResponseDto extends createZodDto(UpdatePasskeyCommand.ResponseSchema) {}

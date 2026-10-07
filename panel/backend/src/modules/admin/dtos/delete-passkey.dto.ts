import { createZodDto } from 'nestjs-zod';

import { DeletePasskeyCommand } from '@libs/contracts/commands';

export class DeletePasskeyBodyDto extends createZodDto(DeletePasskeyCommand.RequestBodySchema) {}

import { createZodDto } from 'nestjs-zod';

import { CreateHostCommand } from '@libs/contracts/commands';

export class CreateHostBodyDto extends createZodDto(CreateHostCommand.RequestBodySchema) {}

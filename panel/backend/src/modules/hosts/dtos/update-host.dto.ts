import { createZodDto } from 'nestjs-zod';

import { UpdateHostCommand } from '@libs/contracts/commands';

export class UpdateHostBodyDto extends createZodDto(UpdateHostCommand.RequestBodySchema) {}

import { UpdateNodeCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class UpdateNodeBodyDto extends createZodDto(UpdateNodeCommand.RequestBodySchema) {}

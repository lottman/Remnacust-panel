import { DeleteNodeCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class DeleteNodeParamDto extends createZodDto(DeleteNodeCommand.RequestParamSchema) {}

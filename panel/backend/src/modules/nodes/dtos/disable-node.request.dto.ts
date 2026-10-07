import { DisableNodeCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class DisableNodeParamDto extends createZodDto(DisableNodeCommand.RequestParamSchema) {}

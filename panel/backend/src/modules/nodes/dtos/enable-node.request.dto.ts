import { EnableNodeCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class EnableNodeParamDto extends createZodDto(EnableNodeCommand.RequestParamSchema) {}

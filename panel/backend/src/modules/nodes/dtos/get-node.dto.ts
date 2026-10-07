import { GetNodeCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetNodeParamDto extends createZodDto(GetNodeCommand.RequestParamSchema) {}

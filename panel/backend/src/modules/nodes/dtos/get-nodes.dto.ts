import { GetNodesCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetNodesResponseDto extends createZodDto(GetNodesCommand.ResponseSchema) {}

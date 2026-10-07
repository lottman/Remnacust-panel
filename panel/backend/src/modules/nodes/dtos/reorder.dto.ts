import { ReorderNodesCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class ReorderNodesBodyDto extends createZodDto(ReorderNodesCommand.RequestBodySchema) {}
export class ReorderNodesResponseDto extends createZodDto(ReorderNodesCommand.ResponseSchema) {}

import { GetNodesTagsCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetNodesTagsResponseDto extends createZodDto(GetNodesTagsCommand.ResponseSchema) {}

import { GetMetadataCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetMetadataResponseDto extends createZodDto(GetMetadataCommand.ResponseSchema) {}
